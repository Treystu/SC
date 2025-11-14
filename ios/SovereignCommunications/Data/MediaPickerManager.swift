//
//  MediaPickerManager.swift
//  Sovereign Communications
//
//  PHPickerViewController wrapper for media selection with optimization
//

import Foundation
import SwiftUI
import PhotosUI
import os.log

/// Manages media selection and optimization using PHPickerViewController
@MainActor
class MediaPickerManager: ObservableObject {
    @Published var selectedImages: [UIImage] = []
    @Published var isPresented = false
    
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "MediaPicker")
    
    /// Maximum image dimension for optimization
    private let maxImageDimension: CGFloat = 2048
    
    /// JPEG compression quality
    private let compressionQuality: CGFloat = 0.8
    
    // MARK: - Picker Configuration
    
    /// Create PHPickerConfiguration for media selection
    func createPickerConfiguration(selectionLimit: Int = 1, filter: PHPickerFilter = .images) -> PHPickerConfiguration {
        var configuration = PHPickerConfiguration()
        configuration.selectionLimit = selectionLimit
        configuration.filter = filter
        configuration.preferredAssetRepresentationMode = .current
        
        return configuration
    }
    
    // MARK: - Image Processing
    
    /// Process selected items from PHPicker
    func processPickedItems(_ results: [PHPickerResult], completion: @escaping ([UIImage]) -> Void) {
        var images: [UIImage] = []
        let group = DispatchGroup()
        
        for result in results {
            group.enter()
            
            // Load image from result
            result.itemProvider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
                defer { group.leave() }
                
                if let error = error {
                    self?.logger.error("Failed to load image: \(error.localizedDescription)")
                    return
                }
                
                guard let image = object as? UIImage else {
                    self?.logger.warning("Object is not a UIImage")
                    return
                }
                
                // Optimize image
                if let optimizedImage = self?.optimizeImage(image) {
                    images.append(optimizedImage)
                }
            }
        }
        
        group.notify(queue: .main) {
            self.selectedImages = images
            completion(images)
            self.logger.info("Processed \(images.count) images")
        }
    }
    
    /// Optimize image for transmission
    func optimizeImage(_ image: UIImage) -> UIImage? {
        // Resize if needed
        let resizedImage = resizeImage(image, maxDimension: maxImageDimension)
        
        // Compress to JPEG
        guard let data = resizedImage.jpegData(compressionQuality: compressionQuality),
              let optimizedImage = UIImage(data: data) else {
            logger.error("Failed to optimize image")
            return nil
        }
        
        let originalSize = image.jpegData(compressionQuality: 1.0)?.count ?? 0
        let optimizedSize = data.count
        let reduction = 100 - (Double(optimizedSize) / Double(originalSize) * 100)
        
        logger.info("Image optimized: \(originalSize) -> \(optimizedSize) bytes (\(String(format: "%.1f", reduction))% reduction)")
        
        return optimizedImage
    }
    
    /// Resize image to fit within max dimension while maintaining aspect ratio
    private func resizeImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        
        // Check if resizing is needed
        if size.width <= maxDimension && size.height <= maxDimension {
            return image
        }
        
        // Calculate new size
        let aspectRatio = size.width / size.height
        var newSize: CGSize
        
        if size.width > size.height {
            newSize = CGSize(width: maxDimension, height: maxDimension / aspectRatio)
        } else {
            newSize = CGSize(width: maxDimension * aspectRatio, height: maxDimension)
        }
        
        // Resize image
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resizedImage = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
        
        logger.debug("Resized image from \(size) to \(newSize)")
        
        return resizedImage
    }
    
    // MARK: - Thumbnail Generation
    
    /// Generate thumbnail for image
    func generateThumbnail(from image: UIImage, size: CGSize) -> UIImage? {
        let renderer = UIGraphicsImageRenderer(size: size)
        let thumbnail = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        
        return thumbnail
    }
}

// MARK: - SwiftUI PHPickerViewController Wrapper

struct PhotoPicker: UIViewControllerRepresentable {
    let configuration: PHPickerConfiguration
    let completion: ([PHPickerResult]) -> Void
    
    func makeUIViewController(context: Context) -> PHPickerViewController {
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(completion: completion)
    }
    
    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let completion: ([PHPickerResult]) -> Void
        
        init(completion: @escaping ([PHPickerResult]) -> Void) {
            self.completion = completion
        }
        
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            completion(results)
        }
    }
}

// MARK: - Example Usage View

struct MediaPickerView: View {
    @StateObject private var pickerManager = MediaPickerManager()
    @State private var showingPicker = false
    
    var body: some View {
        VStack(spacing: 20) {
            // Selected images grid
            if !pickerManager.selectedImages.isEmpty {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 10) {
                        ForEach(Array(pickerManager.selectedImages.enumerated()), id: \.offset) { index, image in
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 100, height: 100)
                                .clipped()
                                .cornerRadius(8)
                        }
                    }
                    .padding()
                }
            }
            
            // Pick button
            Button(action: {
                showingPicker = true
            }) {
                Label("Select Photos", systemImage: "photo.on.rectangle.angled")
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
        }
        .sheet(isPresented: $showingPicker) {
            PhotoPicker(
                configuration: pickerManager.createPickerConfiguration(selectionLimit: 5),
                completion: { results in
                    pickerManager.processPickedItems(results) { images in
                        print("Selected \(images.count) images")
                    }
                }
            )
        }
    }
}
