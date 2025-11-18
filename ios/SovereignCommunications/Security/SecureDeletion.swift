//
//  SecureDeletion.swift
//  Sovereign Communications
//
//  Secure deletion and memory wiping utilities for iOS
//
//  IMPORTANT LIMITATIONS:
//  - SSDs use wear leveling which may prevent true data erasure
//  - File systems may keep journal copies
//  - ARC may keep references we cannot control
//  - These are BEST-EFFORT implementations for defense-in-depth
//
//  Primary defense should always be:
//  1. iOS Keychain for keys
//  2. File protection (NSFileProtectionComplete)
//  3. Encrypted storage
//

import Foundation
import Security

/// Secure deletion and memory wiping utilities
class SecureDeletion {
    
    // MARK: - Memory Wiping
    
    /// Wipe a Data object by overwriting with zeros
    ///
    /// Note: ARC may keep references we cannot control.
    /// This is best-effort.
    ///
    /// - Parameter data: Data to wipe
    static func wipe(_ data: inout Data) {
        data.withUnsafeMutableBytes { ptr in
            guard let baseAddress = ptr.baseAddress else { return }
            memset(baseAddress, 0, ptr.count)
        }
    }
    
    /// Wipe multiple Data objects
    ///
    /// - Parameter dataObjects: Data objects to wipe
    static func wipeMultiple(_ dataObjects: inout [Data]) {
        for i in 0..<dataObjects.count {
            wipe(&dataObjects[i])
        }
    }
    
    /// Execute a block with automatic memory wiping
    ///
    /// - Parameters:
    ///   - data: Sensitive data to use
    ///   - block: Function to execute with the data
    /// - Returns: Result of the block
    static func withAutoWipe<T>(_ data: inout Data, block: (Data) throws -> T) rethrows -> T {
        defer {
            wipe(&data)
        }
        return try block(data)
    }
    
    // MARK: - Secure File Deletion
    
    /// Options for secure file deletion
    struct DeletionOptions {
        /// Number of overwrite passes (default: 2)
        let passes: Int
        
        /// Whether to verify deletion
        let verify: Bool
        
        init(passes: Int = 2, verify: Bool = false) {
            self.passes = passes
            self.verify = verify
        }
    }
    
    /// Securely delete a file by overwriting before deletion
    ///
    /// LIMITATIONS:
    /// - SSDs use wear leveling - data may persist on other blocks
    /// - File system journaling may keep copies
    /// - APFS uses copy-on-write which may leave old data
    /// - This is best-effort, not guaranteed secure erasure
    ///
    /// - Parameters:
    ///   - url: File URL to securely delete
    ///   - options: Deletion options
    /// - Throws: Error if deletion fails
    static func secureDelete(at url: URL, options: DeletionOptions = DeletionOptions()) throws {
        guard FileManager.default.fileExists(atPath: url.path) else {
            return
        }
        
        // Ensure it's a file, not a directory
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
              !isDirectory.boolValue else {
            throw SecureDeletionError.notAFile(url.path)
        }
        
        // Get file attributes
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard let fileSize = attributes[.size] as? UInt64 else {
            throw SecureDeletionError.cannotDetermineSize
        }
        
        // Open file for writing
        let fileHandle = try FileHandle(forWritingTo: url)
        defer {
            try? fileHandle.close()
        }
        
        // Perform overwrite passes
        for pass in 0..<options.passes {
            try fileHandle.seek(toOffset: 0)
            
            let bufferSize = min(4096, Int(fileSize))
            var buffer = Data(count: bufferSize)
            
            var remaining = fileSize
            
            while remaining > 0 {
                let toWrite = min(UInt64(bufferSize), remaining)
                
                // Alternate between random and zeros
                if pass % 2 == 0 {
                    // Random data
                    buffer.withUnsafeMutableBytes { ptr in
                        guard let baseAddress = ptr.baseAddress else { return }
                        _ = SecRandomCopyBytes(kSecRandomDefault, Int(toWrite), baseAddress)
                    }
                } else {
                    // Zero data
                    buffer.withUnsafeMutableBytes { ptr in
                        guard let baseAddress = ptr.baseAddress else { return }
                        memset(baseAddress, 0, Int(toWrite))
                    }
                }
                
                try fileHandle.write(contentsOf: buffer.prefix(Int(toWrite)))
                remaining -= toWrite
            }
            
            // Ensure data is written to disk
            try fileHandle.synchronize()
        }
        
        // Close file before deletion
        try fileHandle.close()
        
        // Final deletion
        try FileManager.default.removeItem(at: url)
        
        // Verify deletion if requested
        if options.verify && FileManager.default.fileExists(atPath: url.path) {
            throw SecureDeletionError.deletionFailed(url.path)
        }
    }
    
    /// Securely delete multiple files
    ///
    /// - Parameters:
    ///   - urls: File URLs to delete
    ///   - options: Deletion options
    /// - Returns: Dictionary of URLs to their deletion success status
    static func secureDeleteMultiple(
        _ urls: [URL],
        options: DeletionOptions = DeletionOptions()
    ) -> [URL: Result<Void, Error>] {
        var results: [URL: Result<Void, Error>] = [:]
        
        for url in urls {
            do {
                try secureDelete(at: url, options: options)
                results[url] = .success(())
            } catch {
                results[url] = .failure(error)
            }
        }
        
        return results
    }
    
    /// Securely delete a directory and all its contents
    ///
    /// WARNING: This will recursively delete everything in the directory!
    ///
    /// - Parameters:
    ///   - url: Directory URL to delete
    ///   - options: Deletion options for files
    /// - Throws: Error if deletion fails
    static func secureDeleteDirectory(
        at url: URL,
        options: DeletionOptions = DeletionOptions()
    ) throws {
        guard FileManager.default.fileExists(atPath: url.path) else {
            return
        }
        
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            throw SecureDeletionError.notADirectory(url.path)
        }
        
        // Get directory contents
        let contents = try FileManager.default.contentsOfDirectory(
            at: url,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: []
        )
        
        // Recursively delete contents
        for itemURL in contents {
            let resourceValues = try itemURL.resourceValues(forKeys: [.isDirectoryKey])
            
            if resourceValues.isDirectory == true {
                try secureDeleteDirectory(at: itemURL, options: options)
            } else {
                try secureDelete(at: itemURL, options: options)
            }
        }
        
        // Delete empty directory
        try FileManager.default.removeItem(at: url)
    }
    
    // MARK: - Utility Functions
    
    /// Generate random data with automatic cleanup
    ///
    /// - Parameters:
    ///   - size: Size of random data in bytes
    ///   - block: Function to use the random data
    /// - Returns: Result of the block
    static func withRandomData<T>(size: Int, block: (Data) throws -> T) rethrows -> T {
        var data = Data(count: size)
        defer {
            wipe(&data)
        }
        
        data.withUnsafeMutableBytes { ptr in
            guard let baseAddress = ptr.baseAddress else { return }
            _ = SecRandomCopyBytes(kSecRandomDefault, size, baseAddress)
        }
        
        return try block(data)
    }
    
    /// Timing-safe comparison with automatic wiping
    ///
    /// - Parameters:
    ///   - a: First data
    ///   - b: Second data
    ///   - wipeAfter: Whether to wipe data after comparison
    /// - Returns: true if data objects are equal
    static func timingSafeCompareAndWipe(
        _ a: inout Data,
        _ b: inout Data,
        wipeAfter: Bool = true
    ) -> Bool {
        defer {
            if wipeAfter {
                wipe(&a)
                wipe(&b)
            }
        }
        
        guard a.count == b.count else {
            return false
        }
        
        var result: UInt8 = 0
        
        a.withUnsafeBytes { aPtr in
            b.withUnsafeBytes { bPtr in
                guard let aBase = aPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                      let bBase = bPtr.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                    return
                }
                
                for i in 0..<a.count {
                    result |= aBase[i] ^ bBase[i]
                }
            }
        }
        
        return result == 0
    }
}

// MARK: - Data Extension

extension Data {
    /// Wipe this Data object by overwriting with zeros
    mutating func secureWipe() {
        SecureDeletion.wipe(&self)
    }
}

// MARK: - URL Extension

extension URL {
    /// Securely delete the file at this URL
    ///
    /// - Parameter options: Deletion options
    /// - Throws: Error if deletion fails
    func secureDelete(options: SecureDeletion.DeletionOptions = SecureDeletion.DeletionOptions()) throws {
        try SecureDeletion.secureDelete(at: self, options: options)
    }
}

// MARK: - Errors

enum SecureDeletionError: Error, LocalizedError {
    case notAFile(String)
    case notADirectory(String)
    case cannotDetermineSize
    case deletionFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .notAFile(let path):
            return "Not a file: \(path)"
        case .notADirectory(let path):
            return "Not a directory: \(path)"
        case .cannotDetermineSize:
            return "Cannot determine file size"
        case .deletionFailed(let path):
            return "Deletion verification failed for: \(path)"
        }
    }
}

// MARK: - Best Practices Documentation

enum SecureDeletionNotes {
    static let limitations = """
        SECURE DELETION LIMITATIONS ON iOS:
        
        1. SSD/Flash Wear Leveling:
           - Flash storage controllers remap blocks to distribute wear
           - Overwritten data may still exist on physical medium
           - True erasure requires full device encryption + erase all content
        
        2. APFS Copy-on-Write:
           - APFS filesystem uses CoW for many operations
           - Modified blocks may leave old data intact
           - Snapshots may preserve old versions
        
        3. File System Journaling:
           - HFS+ and APFS keep transaction logs
           - Previous versions of files may exist in journal
        
        4. Virtual Memory:
           - Data may be swapped to storage
           - We cannot control or wipe swap
           - iOS encrypts swap on all modern devices
        
        5. ARC Memory Management:
           - ARC may create object copies we cannot track
           - Wiping is best-effort for ARC-managed memory
           - Sensitive data should use Keychain
        
        BEST PRACTICES:
        
        1. PRIMARY DEFENSE: Use iOS Keychain for all keys
        2. SECONDARY: Use file protection (NSFileProtectionComplete)
        3. TERTIARY: Use this secure deletion as defense-in-depth
        4. DOCUMENT: Note limitations in security documentation
        5. EDUCATE: Users should enable device passcode + File Data Protection
        6. EXCLUDE: Exclude sensitive files from backups
        """
    
    static let usageExample = """
        // Wipe sensitive data
        var password = "secret".data(using: .utf8)!
        defer {
            password.secureWipe()
        }
        try authenticate(password)
        
        // Use auto-wipe
        try SecureDeletion.withAutoWipe(&sensitiveData) { data in
            try process(data)
        }
        
        // Securely delete file
        let tempFile = FileManager.default.temporaryDirectory
            .appendingPathComponent("temp_secret.dat")
        
        try secretData.write(to: tempFile)
        defer {
            try? tempFile.secureDelete()
        }
        try processFile(tempFile)
        
        // Generate random with auto-cleanup
        let result = try SecureDeletion.withRandomData(size: 32) { nonce in
            try encrypt(message, nonce: nonce)
        }
        """
}
