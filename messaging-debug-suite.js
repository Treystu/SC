#!/usr/bin/env node

/**
 * Comprehensive Messaging Debug Suite
 * Tests all messaging scenarios to identify and reproduce issues
 */

import { MeshNetwork } from './core/dist/mesh/network.js';
import { MessageType } from './core/dist/protocol/message.js';
import { generateIdentity } from './core/dist/crypto/primitives.js';

class NetworkSimulator {
  constructor() {
    this.networks = new Map();
    this.messageLog = [];
  }

  async createNetwork(name) {
    const identity = await generateIdentity();
    const network = new MeshNetwork({
      identity,
      disableAutoConnect: false // Enable auto-connect for testing
    });

    // Hook message delivery to log all messages
    network.onMessage((message) => {
      const senderIdRaw = Array.from(message.header.senderId)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const senderId = senderIdRaw.substring(0, 16).toUpperCase();

      let payload = {};
      try {
        const payloadStr = new TextDecoder().decode(message.payload);
        payload = JSON.parse(payloadStr);
      } catch (e) {
        payload = { raw: 'binary_data' };
      }

      this.messageLog.push({
        timestamp: Date.now(),
        recipient: name,
        recipientPeerId: network.getLocalPeerId(),
        senderId: senderId,
        senderNetwork: this.findNetworkBySenderId(senderId),
        type: MessageType[message.header.type] || message.header.type,
        content: payload.text || payload,
        relayedThrough: [] // TODO: Track relay path
      });

      console.log(`📨 [${name}] Received message:`, {
        from: senderId,
        type: MessageType[message.header.type],
        content: payload.text || 'binary'
      });
    });

    // Hook outbound transport to simulate network delivery
    network.registerOutboundTransport(async (peerId, data) => {
      console.log(`📤 [${name}] Sending to ${peerId}, size: ${data.length} bytes`);

      const target = this.findNetworkByPeerId(peerId);
      if (target) {
        await target.network.handleIncomingPacket(network.getLocalPeerId(), data);
      } else {
        console.warn(`🚫 Delivery failed: Target ${peerId} not found`);
      }
    });

    this.networks.set(name, {
      network,
      peerId: network.getLocalPeerId(),
      identity
    });

    console.log(`🌐 Created network "${name}" with peer ID: ${network.getLocalPeerId()}`);
    return network;
  }

  findNetworkByPeerId(peerId) {
    const normalizedPeerId = peerId.replace(/\s/g, '').toUpperCase();
    for (const [name, { network }] of this.networks) {
      if (network.getLocalPeerId() === normalizedPeerId) {
        return { name, network };
      }
    }
    return null;
  }

  findNetworkBySenderId(senderId) {
    const result = this.findNetworkByPeerId(senderId);
    return result ? result.name : 'UNKNOWN';
  }

  async connectNetworks(name1, name2) {
    const net1 = this.networks.get(name1);
    const net2 = this.networks.get(name2);

    if (!net1 || !net2) {
      throw new Error(`Networks ${name1} or ${name2} not found`);
    }

    // Simulate manual connection by adding peers to routing tables
    net1.network['routingTable'].addPeer({
      id: net2.peerId,
      publicKey: net2.identity.publicKey,
      lastSeen: Date.now(),
      connectedAt: Date.now(),
      transportType: 'webrtc',
      connectionQuality: 100,
      bytesSent: 0,
      bytesReceived: 0,
      state: 'connected',
      metadata: {
        capabilities: { supportedTransports: ['webrtc'], protocolVersion: 1, features: [] },
        reputation: 50,
        blacklisted: false,
        failureCount: 0,
        successCount: 0
      }
    });

    net2.network['routingTable'].addPeer({
      id: net1.peerId,
      publicKey: net1.identity.publicKey,
      lastSeen: Date.now(),
      connectedAt: Date.now(),
      transportType: 'webrtc',
      connectionQuality: 100,
      bytesSent: 0,
      bytesReceived: 0,
      state: 'connected',
      metadata: {
        capabilities: { supportedTransports: ['webrtc'], protocolVersion: 1, features: [] },
        reputation: 50,
        blacklisted: false,
        failureCount: 0,
        successCount: 0
      }
    });

    console.log(`🔗 Connected ${name1} ⟷ ${name2}`);
  }

  async sendMessage(fromNetwork, toNetwork, content) {
    const from = this.networks.get(fromNetwork);
    const to = this.networks.get(toNetwork);

    if (!from || !to) {
      throw new Error(`Networks ${fromNetwork} or ${toNetwork} not found`);
    }

    console.log(`📝 [${fromNetwork}] Sending to [${toNetwork}]: "${content}"`);
    await from.network.sendMessage(to.peerId, content);
  }

  printMessageLog() {
    console.log('\n📋 MESSAGE LOG:');
    console.log('================');

    if (this.messageLog.length === 0) {
      console.log('No messages logged.');
      return;
    }

    for (const msg of this.messageLog) {
      console.log(`[${new Date(msg.timestamp).toISOString()}]`);
      console.log(`  👤 Recipient: ${msg.recipient} (${msg.recipientPeerId})`);
      console.log(`  📤 Sender ID: ${msg.senderId} (from network: ${msg.senderNetwork})`);
      console.log(`  📋 Type: ${msg.type}`);
      console.log(`  💬 Content: ${JSON.stringify(msg.content)}`);
      console.log('  ---');
    }

    // Analyze issues
    this.analyzeIssues();
  }

  analyzeIssues() {
    console.log('\n🔍 ISSUE ANALYSIS:');
    console.log('==================');

    // Check for attribution issues
    const attributionIssues = this.messageLog.filter(msg => {
      return msg.senderNetwork !== msg.recipientNetwork && msg.senderNetwork === 'UNKNOWN';
    });

    if (attributionIssues.length > 0) {
      console.log('❌ MESSAGE ATTRIBUTION ISSUES DETECTED:');
      console.log(`   ${attributionIssues.length} messages show unknown sender`);
    }

    // Check for loopback messages
    const loopbackMessages = this.messageLog.filter(msg => {
      return msg.senderNetwork === msg.recipient;
    });

    if (loopbackMessages.length > 0) {
      console.log('❌ LOOPBACK MESSAGES DETECTED:');
      console.log(`   ${loopbackMessages.length} messages received by their own sender`);
      loopbackMessages.forEach(msg => {
        console.log(`   - ${msg.recipient} received their own message: "${msg.content.text}"`);
      });
    }

    // Check for missing messages
    const expectedDeliveries = this.calculateExpectedDeliveries();
    const actualDeliveries = this.messageLog.length;

    if (actualDeliveries < expectedDeliveries) {
      console.log('❌ MESSAGE DELIVERY FAILURES:');
      console.log(`   Expected ${expectedDeliveries} deliveries, got ${actualDeliveries}`);
    }

    if (attributionIssues.length === 0 && loopbackMessages.length === 0 && actualDeliveries >= expectedDeliveries) {
      console.log('✅ All messaging tests passed!');
    }
  }

  calculateExpectedDeliveries() {
    // This is a simplified calculation - in a real scenario we'd track sent messages
    return this.messagesSent || 0;
  }
}

async function runTests() {
  console.log('🚀 Starting Comprehensive Messaging Debug Suite\n');

  const sim = new NetworkSimulator();

  try {
    // Create test networks
    const alice = await sim.createNetwork('Alice');
    const bob = await sim.createNetwork('Bob');
    const charlie = await sim.createNetwork('Charlie');

    console.log('\n📍 Test 1: Direct Messaging (No Connection)');
    console.log('===========================================');
    try {
      await sim.sendMessage('Alice', 'Bob', 'Hello Bob!');
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for processing
    } catch (error) {
      console.log('Expected failure (no connection):', error.message);
    }

    console.log('\n📍 Test 2: Direct Messaging (Connected)');
    console.log('=======================================');
    await sim.connectNetworks('Alice', 'Bob');
    await sim.sendMessage('Alice', 'Bob', 'Hello Bob from Alice!');
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n📍 Test 3: Bidirectional Messaging');
    console.log('==================================');
    await sim.sendMessage('Bob', 'Alice', 'Hello back Alice!');
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n📍 Test 4: Multi-hop Relay Messaging');
    console.log('====================================');
    await sim.connectNetworks('Bob', 'Charlie');
    await sim.sendMessage('Alice', 'Charlie', 'Hello Charlie via Bob!');
    await new Promise(resolve => setTimeout(resolve, 200)); // Extra time for relay

    console.log('\n📍 Test 5: Broadcast Messaging');
    console.log('==============================');
    await alice.broadcastMessage('Broadcast from Alice to all!');
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n📍 Test 6: Self-messaging (Potential Loopback)');
    console.log('===============================================');
    await sim.sendMessage('Alice', 'Alice', 'Message to myself');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Print results
    sim.printMessageLog();

  } catch (error) {
    console.error('Test suite failed:', error);
    console.error(error.stack);
  } finally {
    // Cleanup
    for (const [name, { network }] of sim.networks) {
      try {
        await network.shutdown();
      } catch (e) {}
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { NetworkSimulator, runTests };