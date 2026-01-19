/oh-my-claude-sisyphus:ralph-loop Analyze the entire codebase to implement the \\'Silent Mesh' architecture, ensuring aggressive background connectivity while keeping the user experience clean.
THE MISSION: THE SILENT MESH & THE ETERNAL LEDGER We are correcting a previous over-correction. The mesh must NOT be disabled. It must be aggressive in the background but silent in the foreground.
CORE OBJECTIVE:
	1	Aggressive Connection: Automatically connect to all discoverable peers as mesh nodes for relaying and health checks.
	2	Social Silence: NEVER create a 'Contact' or 'Conversation' in the UI/Storage for these technical connections unless the user explicitly interacts.
	3	The Eternal Ledger: Maintain a persistent, terse history of 'Last Known Good Addresses' and 'Known Nodes' that survives identity resets. This is crucial for routing retries, security checks (IP spoofing detection), and 'watering hole' delivery scenarios.
YOUR EXECUTION PLAN (Iterate until 'SISYPHUS_HAS_UNIFIED'):
PHASE 1: ARCHITECTURAL SEPARATION & PERSISTENCE
	1	Refactor core/src/mesh/network.ts & web/src/hooks/useMeshNetwork.ts:
	◦	Decouple: Separate PeerDiscovery results into two streams: potentialSocialContacts (requires user action) and meshNeighbors (automatic).
	◦	Action: Trigger immediate technical connection to meshNeighbors without touching contactManager or storage.saveContact().
	2	Implement 'The Ledger' (New Component):
	◦	Create a lightweight persistence layer for KnownNodes. This must store: NodeID, LastKnownIP, LastSeenTimestamp, PublicKey.
	◦	Constraint: Keep it terse to prevent bloat.
	◦	Logic: When generating a new identity, DO NOT RESET this list. Use it to bootstrap the new identity into the existing mesh immediately.
	3	Implement 'Watering Hole' Delivery:
	◦	Add a logic path for Relay: If a message destination is offline, check the Ledger. If the node was seen recently at a specific gateway (cafe/public IP), hold the message with a flexible TTL (Time-To-Live) and attempt delivery if that path reactivates.
PHASE 2: UI UNIFICATION (The 'Eye of God' Fix)
	1	Global UI Integration:
	◦	The 'Connected Peers' indicator (top right) MUST reflect networkManager.getAllConnections().length (the raw mesh count), NOT the contacts count.
	◦	Update NetworkDiagnostics.tsx, Console Logs, and any 'Connection Status' badges to use this same raw mesh stat.
	◦	Ensure the UI shows 'Connected' even if the 'Contacts' list is empty.
	2	Visual Verification:
	◦	Ensure UnifiedLogs displays these background connection events (e.g., 'Connected to mesh peer [ID]... awaiting handshake') so we can verify activity without polluting the chat list.
PHASE 3: PROACTIVE INTELLIGENCE & OPTIMIZATION
	1	'Light Ping' Protocol:
	◦	Implement a lightweight check against the 'Last Known Good Addresses' list on startup.
	◦	If a node is active, handshake immediately.
	◦	If an ID matches a stored message recipient, deliver background messages.
	2	Device Profile Awareness:
	◦	Modify Discovery logic to throttle 'Assertiveness' based on context (e.g., if on battery power vs. plugged in).
	3	Future Documentation:
	◦	Create a docs/FUTURE_ROUTING_TODO.md file listing specific items for:
	▪	Advanced 'Friends of Friends' routing using the Ledger.
	▪	Heuristics for 'Watering Hole' overlap prediction.
PHASE 4: THE 'SILENT MESH' VERIFICATION SUITE Write and run tests/integration/silent-mesh.test.ts:
	1	Scenario: User A (Fresh) joins a room with User B (Existing).
	2	ASSERT: User A's activeMeshPeers count is 1.
	3	ASSERT: User A's ContactList is 0.
	4	ASSERT: User A's KnownNodes ledger contains User B's ID/Address.
	5	ASSERT: Changing User A's identity retains User B in the KnownNodes ledger.
FINAL DELIVERABLE:
	•	A unified codebase where the mesh connects aggressively in the background.
	•	A UI that remains pristine for new users but accurately reports mesh health.
	•	A persistent 'Ledger' that survives identity changes.
	•	Successful execution of the silent mesh test suite.
Output <promise>SISYPHUS_HAS_UNIFIED</promise> only when these architectures are implemented and verified.
