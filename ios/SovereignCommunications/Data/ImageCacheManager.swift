//
//  ImageCacheManager.swift
//  Sovereign Communications
//
//  Image caching system for efficient memory and disk management
//

import Foundation
import UIKit
import os.log

/// Manages image caching with memory and disk storage
class ImageCacheManager {
    static let shared = ImageCacheManager()
    
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "ImageCache")
    
    // MARK: - Cache Configuration
    
    private let memoryCache = NSCache<NSString, UIImage>()
    private let diskCacheURL: URL
    private let fileManager = FileManager.default
    
    // Cache limits
    private let maxMemoryCacheSize = 50 * 1024 * 1024 // 50 MB
    private let maxDiskCacheSize = 200 * 1024 * 1024 // 200 MB
    private let maxCacheAge: TimeInterval = 7 * 24 * 60 * 60 // 7 days
    
    private init() {
        // Setup memory cache
        memoryCache.totalCostLimit = maxMemoryCacheSize
        memoryCache.countLimit = 100
        
        // Setup disk cache directory
        let cacheDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        diskCacheURL = cacheDirectory.appendingPathComponent("ImageCache")
        
        // Create disk cache directory if needed
        try? fileManager.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)
        
        // Setup cleanup notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cleanupMemoryCache),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cleanupExpiredDiskCache),
            name: UIApplication.willTerminateNotification,
            object: nil
        )
        
        logger.info("Image cache initialized")
    }
    
    // MARK: - Public API
    
    /// Store image in cache
    func store(image: UIImage, forKey key: String, toDisk: Bool = true) {
        let cacheKey = key as NSString
        
        // Store in memory cache
        let cost = estimateImageSize(image)
        memoryCache.setObject(image, forKey: cacheKey, cost: cost)
        
        // Store to disk if requested
        if toDisk {
            DispatchQueue.global(qos: .background).async { [weak self] in
                self?.storeToDisk(image: image, forKey: key)
            }
        }
        
        logger.debug("Stored image for key: \(key)")
    }
    
    /// Retrieve image from cache
    func retrieve(forKey key: String, completion: @escaping (UIImage?) -> Void) {
        let cacheKey = key as NSString
        
        // Check memory cache first
        if let image = memoryCache.object(forKey: cacheKey) {
            logger.debug("Retrieved image from memory cache: \(key)")
            completion(image)
            return
        }
        
        // Check disk cache
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            if let image = self?.retrieveFromDisk(forKey: key) {
                // Store in memory cache for faster access
                self?.memoryCache.setObject(image, forKey: cacheKey)
                
                DispatchQueue.main.async {
                    self?.logger.debug("Retrieved image from disk cache: \(key)")
                    completion(image)
                }
            } else {
                DispatchQueue.main.async {
                    completion(nil)
                }
            }
        }
    }
    
    /// Remove image from cache
    func remove(forKey key: String) {
        let cacheKey = key as NSString
        memoryCache.removeObject(forKey: cacheKey)
        
        DispatchQueue.global(qos: .background).async { [weak self] in
            self?.removeFromDisk(forKey: key)
        }
        
        logger.debug("Removed image for key: \(key)")
    }
    
    /// Clear all cached images
    func clearCache() {
        memoryCache.removeAllObjects()
        
        DispatchQueue.global(qos: .background).async { [weak self] in
            guard let self = self else { return }
            
            do {
                let contents = try self.fileManager.contentsOfDirectory(
                    at: self.diskCacheURL,
                    includingPropertiesForKeys: nil
                )
                
                for url in contents {
                    try? self.fileManager.removeItem(at: url)
                }
                
                self.logger.info("Cleared all cached images")
            } catch {
                self.logger.error("Failed to clear cache: \(error.localizedDescription)")
            }
        }
    }
    
    /// Get cache statistics
    func getCacheStatistics() -> CacheStatistics {
        var diskSize: Int64 = 0
        var fileCount = 0
        
        do {
            let contents = try fileManager.contentsOfDirectory(
                at: diskCacheURL,
                includingPropertiesForKeys: [.fileSizeKey]
            )
            
            fileCount = contents.count
            
            for url in contents {
                if let resources = try? url.resourceValues(forKeys: [.fileSizeKey]),
                   let fileSize = resources.fileSize {
                    diskSize += Int64(fileSize)
                }
            }
        } catch {
            logger.error("Failed to get cache statistics: \(error.localizedDescription)")
        }
        
        return CacheStatistics(
            diskCacheSize: diskSize,
            fileCount: fileCount,
            maxDiskCacheSize: Int64(maxDiskCacheSize),
            maxMemoryCacheSize: Int64(maxMemoryCacheSize)
        )
    }
    
    // MARK: - Disk Operations
    
    private func storeToDisk(image: UIImage, forKey key: String) {
        guard let data = image.jpegData(compressionQuality: 0.9) else {
            logger.error("Failed to convert image to data")
            return
        }
        
        let fileURL = diskCacheURL.appendingPathComponent(key.md5Hash)
        
        do {
            try data.write(to: fileURL)
            logger.debug("Stored image to disk: \(key)")
        } catch {
            logger.error("Failed to store image to disk: \(error.localizedDescription)")
        }
    }
    
    private func retrieveFromDisk(forKey key: String) -> UIImage? {
        let fileURL = diskCacheURL.appendingPathComponent(key.md5Hash)
        
        guard let data = try? Data(contentsOf: fileURL),
              let image = UIImage(data: data) else {
            return nil
        }
        
        return image
    }
    
    private func removeFromDisk(forKey key: String) {
        let fileURL = diskCacheURL.appendingPathComponent(key.md5Hash)
        try? fileManager.removeItem(at: fileURL)
    }
    
    // MARK: - Cleanup
    
    @objc private func cleanupMemoryCache() {
        memoryCache.removeAllObjects()
        logger.info("Cleaned up memory cache due to memory warning")
    }
    
    @objc private func cleanupExpiredDiskCache() {
        DispatchQueue.global(qos: .background).async { [weak self] in
            guard let self = self else { return }
            
            do {
                let contents = try self.fileManager.contentsOfDirectory(
                    at: self.diskCacheURL,
                    includingPropertiesForKeys: [.contentModificationDateKey]
                )
                
                let expirationDate = Date().addingTimeInterval(-self.maxCacheAge)
                var removedCount = 0
                
                for url in contents {
                    if let resources = try? url.resourceValues(forKeys: [.contentModificationDateKey]),
                       let modificationDate = resources.contentModificationDate,
                       modificationDate < expirationDate {
                        try? self.fileManager.removeItem(at: url)
                        removedCount += 1
                    }
                }
                
                self.logger.info("Cleaned up \(removedCount) expired cache files")
            } catch {
                self.logger.error("Failed to cleanup expired cache: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Utilities
    
    private func estimateImageSize(_ image: UIImage) -> Int {
        let width = Int(image.size.width)
        let height = Int(image.size.height)
        let bytesPerPixel = 4 // RGBA
        return width * height * bytesPerPixel
    }
}

// MARK: - Cache Statistics

struct CacheStatistics {
    let diskCacheSize: Int64
    let fileCount: Int
    let maxDiskCacheSize: Int64
    let maxMemoryCacheSize: Int64
    
    var diskCacheSizeMB: Double {
        Double(diskCacheSize) / 1024.0 / 1024.0
    }
    
    var maxDiskCacheSizeMB: Double {
        Double(maxDiskCacheSize) / 1024.0 / 1024.0
    }
    
    var diskCacheUsagePercentage: Double {
        Double(diskCacheSize) / Double(maxDiskCacheSize) * 100.0
    }
}

// MARK: - String Extension for MD5

extension String {
    var md5Hash: String {
        // Simple hash for filename - in production, use CryptoKit
        let hash = self.data(using: .utf8)?.hashValue ?? 0
        return String(format: "%016x", abs(hash))
    }
}

// MARK: - SwiftUI Async Image Loader

import SwiftUI

struct CachedAsyncImage<Content: View>: View {
    let url: URL?
    let placeholder: () -> Content
    
    @State private var image: UIImage?
    
    init(url: URL?, @ViewBuilder placeholder: @escaping () -> Content) {
        self.url = url
        self.placeholder = placeholder
    }
    
    var body: some View {
        Group {
            if let image = image {
                Image(uiImage: image)
                    .resizable()
            } else {
                placeholder()
                    .onAppear {
                        loadImage()
                    }
            }
        }
    }
    
    private func loadImage() {
        guard let url = url else { return }
        
        let key = url.absoluteString
        
        // Try to load from cache
        ImageCacheManager.shared.retrieve(forKey: key) { cachedImage in
            if let cachedImage = cachedImage {
                self.image = cachedImage
            } else {
                // Download image
                URLSession.shared.dataTask(with: url) { data, _, _ in
                    if let data = data, let downloadedImage = UIImage(data: data) {
                        DispatchQueue.main.async {
                            self.image = downloadedImage
                            ImageCacheManager.shared.store(image: downloadedImage, forKey: key)
                        }
                    }
                }.resume()
            }
        }
    }
}
