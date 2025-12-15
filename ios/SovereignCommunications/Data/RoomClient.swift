//
//  RoomClient.swift
//  SovereignCommunications
//
//  Created by Auto-Agent on 2025-12-14.
//

import Foundation

class RoomClient {
    private let baseUrl = "https://sc.netlify.app/.netlify/functions/room"
    
    struct PeerInfo {
        let id: String
        let metadata: [String: Any]?
    }
    
    struct Signal {
        let id: String
        let from: String
        let type: String
        let payload: String
    }
    
    enum RoomError: Error {
        case invalidURL
        case networkError(Error)
        case invalidResponse
        case decodingError
    }
    
    func join(peerId: String, roomUrl: String? = nil) async throws -> [PeerInfo] {
        let urlStr = roomUrl ?? baseUrl
        guard let url = URL(string: urlStr) else { throw RoomError.invalidURL }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload: [String: Any] = [
            "action": "join",
            "peerId": peerId,
            "payload": [
                "metadata": [
                    "userAgent": "iOS/1.0"
                ]
            ]
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let peersArray = json["peers"] as? [[String: Any]] else {
            throw RoomError.invalidResponse
        }
        
        return peersArray.compactMap { dict in
            guard let id = dict["_id"] as? String else { return nil }
            return PeerInfo(id: id, metadata: dict["metadata"] as? [String: Any])
        }
    }
    
    func poll(peerId: String, roomUrl: String? = nil) async throws -> ([Signal], [PeerInfo]) {
        let urlStr = roomUrl ?? baseUrl
        guard let url = URL(string: urlStr) else { throw RoomError.invalidURL }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload: [String: Any] = [
            "action": "poll",
            "peerId": peerId
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw RoomError.invalidResponse
        }
        
        let signals = (json["signals"] as? [[String: Any]])?.compactMap { dict -> Signal? in
            guard let id = dict["id"] as? String,
                  let from = dict["from"] as? String,
                  let type = dict["type"] as? String,
                  let payload = dict["signal"] as? String else { return nil }
            return Signal(id: id, from: from, type: type, payload: payload)
        } ?? []
        
        let peers = (json["peers"] as? [[String: Any]])?.compactMap { dict -> PeerInfo? in
            guard let id = dict["_id"] as? String else { return nil }
            return PeerInfo(id: id, metadata: dict["metadata"] as? [String: Any])
        } ?? []
        
        return (signals, peers)
    }
    
    func sendSignal(fromPeerId: String, toPeerId: String, type: String, signalData: String, roomUrl: String? = nil) async throws -> Bool {
        let urlStr = roomUrl ?? baseUrl
        guard let url = URL(string: urlStr) else { throw RoomError.invalidURL }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload: [String: Any] = [
            "action": "signal",
            "peerId": fromPeerId,
            "payload": [
                "to": toPeerId,
                "type": type,
                "signal": signalData
            ]
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return json["success"] as? Bool ?? false
        }
        return false
    }
}
