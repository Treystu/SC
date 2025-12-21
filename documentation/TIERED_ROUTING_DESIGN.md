# Tiered Smart Routing Design & Context

## Context

As the mesh network scales from a handful of users to potentially hundreds or thousands, the initial "blind flood" routing strategy becomes unsustainable.

- **Blind Flooding**: Every node forwards every message to every other connected node (except the sender).
- **Issues**:
  - Exponential message amplification.
  - Network congestion preventing legitimate traffic delivery ("messages not coming through").
  - phantom/echo messages due to routing loops (mitigated by deduplication, but still wasteful).

## Solution: Tiered Smart Routing

We have transitioned from a pure flooding architecture to a **tiered, probabilistic routing system** inspired by Kademlia and epidemic protocols.

### Core Logic

The routing decision is now **dynamic** and calculated per-hop. It is not a static path; every node evaluates the best next steps based on its current view of the network.

#### 1. Peer Ranking (`routing.ts`: `getRankedPeersForTarget`)

When a node needs to forward a message to a `targetId`, it ranks its connected peers using a **"Score for NOW"** philosophy, prioritizing real-time capability over historical averages:

1. **Direct Connection** (Score +2000): Is the peer the target itself? (Highest Priority).
2. **Known Route** (Score +300 * Quality): Is this peer the "Next Hop" in our calculated routing table? **Crucially**, this score is multiplied by the peer's *current\* connection quality. A "known" route is worthless if the link is currently poor.
3. **Connection Quality** (Score +0-100): The baseline value of any peer is its current link health standard.
4. **Bandwidth / Uplink Capacity** (Score +~100): Peers with high proven throughput or "Local" transport types (WiFi/LAN) get a bonus. Peers on low-bandwidth links (Bluetooth) receive a penalty, ensuring we prefer "Datacenter/Uplink" nodes when available.
5. **Kademlia Proximity** (Tie-Breaker/Potential): If multiple peers have similar health scores, we prefer the one closer to the target in the XOR metric space (Logarithmic distance).
6. **Dynamic Penalty**: Peers in a `DEGRADED` state are penalized **only if their current quality is low**. If a historically flaky peer shows high current health, it receives **zero penalty**, allowing for an immediate "Fresh Start".

#### 2. Adaptive Selection Threshold (`network.ts`)

Instead of choosing just _one_ path (brittle) or _all_ paths (redundant/spammy), we use an adaptive threshold based on local density:

- **Sparse Mode (<= 5 peers)**:
  - If a node has few connections (e.g., isolated usage, small groups), it **floods to all peers**.
  - _Reason_: Connectivity is fragile; redundancy is prioritized over efficiency.
- **Dense Mode (> 5 peers)**:
  - If a node has many connections (e.g., crowded room, large mesh), it selects only the **Top 10%** of ranked peers (with a floor of 5).
  - _Reason_: In a dense network, "closest" nodes are statistically highly likely to know the path. Flooding everything would cause a storm.

### Benefits

- **Scalability**: Message complexity drops from O(N\*M) roughly towards O(log N) or O(sqrt N) depending on topology.
- **Robustness**: By selecting multiple best "next hops" (e.g., 5 or 10% instead of 1), we survive individual peer churn/dropouts without retrying.
- **Intelligence**: The network "heals" and finds paths dynamically. A message roughly "gravitates" towards the destination using the XOR metric.

## Implementation Details

- **Layer 3 Integration**: The logic handles both WebRTC (Internal) and Native/BLE (External) peers seamlessly via the `RoutingTable`.
- **Packet Inspection**: Currently, the routing layer peeks into the JSON payload to find the `recipientId` to route intelligently. (Future optimization: move `recipient` to the binary Header).
- **Fallback**: If no target is specified (Broadcast/Discovery), or parsing fails, the system safely falls back to Full Flood.

## Future Dynamic Adjustments

- **Instant Ack Feedback**: Use ACKs only to confirm _immediate_ path viability. If a node fails, we simply try others for the current message. We explicitly **do not** penalize nodes for historical unavailability; if a node is "good now" (connected/healthy), it gets a fresh start immediately.
- **Congestion Control**: We can lower the selection % if local bandwidth is saturated.
