/**
 * Demonstration of Messaging Issues
 *
 * This test suite reproduces the critical messaging issues to help understand
 * and validate fixes.
 */

import { MeshNetwork } from './mesh/network.js';
import { MessageType, Message } from './protocol/message.js';
import { generateIdentity } from './crypto/primitives.js';

describe('Messaging Issues Demo', () => {
  let networkAlice: MeshNetwork;
  let networkBob: MeshNetwork;
  let networkCharlie: MeshNetwork;
  let peerIdAlice: string;
  let peerIdBob: string;
  let peerIdCharlie: string;
  let messagesReceived: Array<{
    recipient: string;
    senderId: string;
    content: any;
    timestamp: number;
  }> = [];

  beforeEach(async () => {
    messagesReceived = [];

    // Create test networks
    networkAlice = new MeshNetwork({
      identity: await generateIdentity(),
      disableAutoConnect: false
    });

    networkBob = new MeshNetwork({
      identity: await generateIdentity(),
      disableAutoConnect: false
    });

    networkCharlie = new MeshNetwork({
      identity: await generateIdentity(),
      disableAutoConnect: false
    });

    peerIdAlice = networkAlice.getLocalPeerId();
    peerIdBob = networkBob.getLocalPeerId();
    peerIdCharlie = networkCharlie.getLocalPeerId();

    // Set up message logging
    const setupMessageLogging = (network: MeshNetwork, name: string) => {
      network.onMessage((message: Message) => {
        // First try to get the original sender from payload
        let senderId: string;
        let content: any = {};

        try {
          const payloadStr = new TextDecoder().decode(message.payload);
          content = JSON.parse(payloadStr);

          // Use originalSenderId from payload if available, otherwise fall back to header
          if (content.originalSenderId) {
            senderId = content.originalSenderId;
          } else {
            const senderIdRaw = Array.from(message.header.senderId)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            senderId = senderIdRaw.substring(0, 16).toUpperCase();
          }
        } catch (e) {
          // Fallback to header senderId for binary content
          const senderIdRaw = Array.from(message.header.senderId)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          senderId = senderIdRaw.substring(0, 16).toUpperCase();
          content = { raw: 'binary' };
        }

        messagesReceived.push({
          recipient: name,
          senderId,
          content,
          timestamp: Date.now()
        });

        console.log(`📨 [${name}] Message from ${senderId} (original):`, content);
      });
    };

    setupMessageLogging(networkAlice, 'Alice');
    setupMessageLogging(networkBob, 'Bob');
    setupMessageLogging(networkCharlie, 'Charlie');

    // Set up transport simulation
    const setupTransport = (network: MeshNetwork, name: string) => {
      network.registerOutboundTransport(async (peerId, data) => {
        console.log(`📤 [${name}] → ${peerId} (${data.length} bytes)`);

        // Find target network
        let targetNetwork: MeshNetwork | null = null;
        if (peerId.toUpperCase() === peerIdAlice.toUpperCase()) {
          targetNetwork = networkAlice;
        } else if (peerId.toUpperCase() === peerIdBob.toUpperCase()) {
          targetNetwork = networkBob;
        } else if (peerId.toUpperCase() === peerIdCharlie.toUpperCase()) {
          targetNetwork = networkCharlie;
        }

        if (targetNetwork) {
          await targetNetwork.handleIncomingPacket(network.getLocalPeerId(), data);
        } else {
          console.warn(`🚫 No route to ${peerId}`);
        }
      });
    };

    setupTransport(networkAlice, 'Alice');
    setupTransport(networkBob, 'Bob');
    setupTransport(networkCharlie, 'Charlie');

    console.log(`🌐 Networks created:
      Alice: ${peerIdAlice}
      Bob: ${peerIdBob}
      Charlie: ${peerIdCharlie}`);
  });

  afterEach(async () => {
    await networkAlice?.shutdown();
    await networkBob?.shutdown();
    await networkCharlie?.shutdown();
  });

  function connectNetworks(net1: MeshNetwork, net2: MeshNetwork, id1: string, id2: string) {
    const mockIdentity1 = networkAlice.getIdentity();
    const mockIdentity2 = networkBob.getIdentity();

    // Add peer connections
    net1['routingTable'].addPeer({
      id: id2,
      publicKey: net2.getPublicKey(),
      lastSeen: Date.now(),
      connectedAt: Date.now(),
      transportType: 'webrtc',
      connectionQuality: 100,
      bytesSent: 0,
      bytesReceived: 0,
      state: 'connected' as any,
      metadata: {
        capabilities: { supportedTransports: ['webrtc'], protocolVersion: 1, features: [] },
        reputation: 50,
        blacklisted: false,
        failureCount: 0,
        successCount: 0
      }
    });

    net2['routingTable'].addPeer({
      id: id1,
      publicKey: net1.getPublicKey(),
      lastSeen: Date.now(),
      connectedAt: Date.now(),
      transportType: 'webrtc',
      connectionQuality: 100,
      bytesSent: 0,
      bytesReceived: 0,
      state: 'connected' as any,
      metadata: {
        capabilities: { supportedTransports: ['webrtc'], protocolVersion: 1, features: [] },
        reputation: 50,
        blacklisted: false,
        failureCount: 0,
        successCount: 0
      }
    });
  }

  it('Demo Issue 1: Message Attribution Problem (Relay shows as sender)', async () => {
    console.log('\n🔍 TESTING: Message Attribution Through Relay');

    // Connect Alice → Bob → Charlie (chain)
    connectNetworks(networkAlice, networkBob, peerIdAlice, peerIdBob);
    connectNetworks(networkBob, networkCharlie, peerIdBob, peerIdCharlie);

    // Alice sends message to Charlie (should go via Bob)
    await networkAlice.sendMessage(peerIdCharlie, 'Hello Charlie from Alice!');

    // Wait for message propagation
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n📋 Messages received:', messagesReceived);

    // Find Charlie's received message
    const charlieMessages = messagesReceived.filter(m => m.recipient === 'Charlie');

    if (charlieMessages.length > 0) {
      const msg = charlieMessages[0];
      console.log(`\n🔍 Message Analysis:
        Expected sender ID: ${peerIdAlice}
        Actual sender ID:   ${msg.senderId}
        Sender ID matches Alice: ${msg.senderId === peerIdAlice}
        Sender ID matches Bob (relay): ${msg.senderId === peerIdBob}
      `);

      if (msg.senderId === peerIdBob) {
        console.log('❌ ISSUE CONFIRMED: Message shows Bob (relay) as sender instead of Alice (original)');
      } else if (msg.senderId === peerIdAlice) {
        console.log('✅ Message attribution is correct');
      } else {
        console.log('❓ Unexpected sender ID');
      }
    }
  });

  it('Demo Issue 2: Loopback Messages (Self-delivery)', async () => {
    console.log('\n🔍 TESTING: Loopback Message Detection');

    // Connect Alice to Bob
    connectNetworks(networkAlice, networkBob, peerIdAlice, peerIdBob);

    // Alice sends message to Bob
    await networkAlice.sendMessage(peerIdBob, 'Hello Bob!');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n📋 Messages received:', messagesReceived);

    // Check if Alice received her own message
    const aliceMessages = messagesReceived.filter(m => m.recipient === 'Alice');
    const aliceLoopbacks = aliceMessages.filter(m => m.senderId === peerIdAlice);

    if (aliceLoopbacks.length > 0) {
      console.log(`❌ LOOPBACK ISSUE: Alice received ${aliceLoopbacks.length} of her own messages`);
      aliceLoopbacks.forEach((msg, i) => {
        console.log(`  Loop ${i + 1}: ${JSON.stringify(msg.content)}`);
      });
    } else {
      console.log('✅ No loopback messages detected');
    }

    // Check if Bob received the message correctly
    const bobMessages = messagesReceived.filter(m => m.recipient === 'Bob');
    if (bobMessages.length > 0) {
      console.log('✅ Bob received message correctly');
    } else {
      console.log('❌ Bob did not receive the message');
    }
  });

  it('Demo Issue 3: Peer ID Normalization', async () => {
    console.log('\n🔍 TESTING: Peer ID Normalization Issues');

    console.log(`Peer IDs:
      Alice: ${peerIdAlice} (length: ${peerIdAlice.length})
      Bob: ${peerIdBob} (length: ${peerIdBob.length})
      Charlie: ${peerIdCharlie} (length: ${peerIdCharlie.length})
    `);

    // Test if all peer IDs are 16 chars uppercase
    const allIds = [peerIdAlice, peerIdBob, peerIdCharlie];
    const issues = [];

    for (const id of allIds) {
      if (id.length !== 16) {
        issues.push(`ID length ${id.length} !== 16: ${id}`);
      }
      if (id !== id.toUpperCase()) {
        issues.push(`ID not uppercase: ${id}`);
      }
      if (!/^[A-F0-9]+$/.test(id)) {
        issues.push(`ID contains non-hex chars: ${id}`);
      }
    }

    if (issues.length > 0) {
      console.log('❌ PEER ID ISSUES:');
      issues.forEach(issue => console.log(`  - ${issue}`));
    } else {
      console.log('✅ All peer IDs are properly normalized (16 chars uppercase hex)');
    }
  });

  it('Demo Issue 4: Connection State Management', async () => {
    console.log('\n🔍 TESTING: Connection State Issues');

    console.log('Before connection:');
    console.log(`  Alice → Bob connected: ${networkAlice.isConnectedToPeer(peerIdBob)}`);
    console.log(`  Bob → Alice connected: ${networkBob.isConnectedToPeer(peerIdAlice)}`);

    // Connect the networks
    connectNetworks(networkAlice, networkBob, peerIdAlice, peerIdBob);

    console.log('After connection setup:');
    console.log(`  Alice → Bob connected: ${networkAlice.isConnectedToPeer(peerIdBob)}`);
    console.log(`  Bob → Alice connected: ${networkBob.isConnectedToPeer(peerIdAlice)}`);

    // Test case-insensitive lookup
    console.log('Case-insensitive tests:');
    console.log(`  Alice → Bob (lowercase): ${networkAlice.isConnectedToPeer(peerIdBob.toLowerCase())}`);
    console.log(`  Bob → Alice (lowercase): ${networkBob.isConnectedToPeer(peerIdAlice.toLowerCase())}`);

    const aliceConnectedPeers = networkAlice.getConnectedPeers();
    const bobConnectedPeers = networkBob.getConnectedPeers();

    console.log(`Connected peer counts:
      Alice: ${aliceConnectedPeers.filter(p => p.state === 'connected').length}
      Bob: ${bobConnectedPeers.filter(p => p.state === 'connected').length}
    `);

    if (aliceConnectedPeers.filter(p => p.state === 'connected').length === 0 ||
        bobConnectedPeers.filter(p => p.state === 'connected').length === 0) {
      console.log('❌ CONNECTION ISSUE: Peers not showing as connected in routing table');
    } else {
      console.log('✅ Peer connections established correctly');
    }
  });

  it('Summary: Comprehensive Issue Detection', async () => {
    console.log('\n🎯 COMPREHENSIVE MESSAGING ISSUE SUMMARY');
    console.log('=======================================');

    // This test combines all scenarios to show the full picture
    connectNetworks(networkAlice, networkBob, peerIdAlice, peerIdBob);
    connectNetworks(networkBob, networkCharlie, peerIdBob, peerIdCharlie);

    // Send various message types
    await networkAlice.sendMessage(peerIdBob, 'Direct message Alice→Bob');
    await networkAlice.sendMessage(peerIdCharlie, 'Relayed message Alice→Charlie');
    await networkBob.sendMessage(peerIdAlice, 'Reply Bob→Alice');

    await new Promise(resolve => setTimeout(resolve, 200));

    console.log(`\n📊 FINAL STATISTICS:
      Total messages sent: 3
      Total messages received: ${messagesReceived.length}
      Unique senders detected: ${new Set(messagesReceived.map(m => m.senderId)).size}
      Expected senders: 2 (Alice, Bob)
    `);

    // Analysis
    const attributionErrors = messagesReceived.filter(msg => {
      const expectedSender = msg.content.text?.startsWith('Direct message Alice') ? peerIdAlice :
                           msg.content.text?.startsWith('Relayed message Alice') ? peerIdAlice :
                           msg.content.text?.startsWith('Reply Bob') ? peerIdBob : null;
      return expectedSender && msg.senderId !== expectedSender;
    });

    const loopbackMessages = messagesReceived.filter(msg => {
      return (msg.recipient === 'Alice' && msg.senderId === peerIdAlice) ||
             (msg.recipient === 'Bob' && msg.senderId === peerIdBob) ||
             (msg.recipient === 'Charlie' && msg.senderId === peerIdCharlie);
    });

    console.log(`\n🔍 ISSUE SUMMARY:
      Attribution errors: ${attributionErrors.length}
      Loopback messages: ${loopbackMessages.length}
      Missing deliveries: ${Math.max(0, 3 - messagesReceived.length)}
    `);

    if (attributionErrors.length > 0) {
      console.log('\n❌ ATTRIBUTION ERRORS:');
      attributionErrors.forEach(error => {
        console.log(`  - ${error.recipient} received message showing wrong sender: ${error.senderId}`);
      });
    }

    if (loopbackMessages.length > 0) {
      console.log('\n❌ LOOPBACK MESSAGES:');
      loopbackMessages.forEach(loop => {
        console.log(`  - ${loop.recipient} received their own message`);
      });
    }

    if (attributionErrors.length === 0 && loopbackMessages.length === 0 && messagesReceived.length >= 3) {
      console.log('\n✅ ALL MESSAGING TESTS PASSED!');
    } else {
      console.log('\n❌ MESSAGING ISSUES DETECTED - FIXES NEEDED');
    }
  });
});