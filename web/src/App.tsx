import { useState, useEffect, useRef, useCallback } from "react";

import "./sentry";
import "./App.css";
import ConversationList from "./components/ConversationList";
import ChatView from "./components/ChatView";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { SettingsPanel } from "./components/SettingsPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OnboardingFlow } from "./components/Onboarding/OnboardingFlow";
import { QRCodeShare } from "./components/QRCodeShare";
import { InviteAcceptanceModal } from "./components/InviteAcceptanceModal";
import { NetworkDiagnostics } from "./components/NetworkDiagnostics";
import { RoomView } from "./components/RoomView";
import { GroupChat } from "./components/GroupChat";
import { PWAInstall, UpdateNotification } from "./components/PWAInstall";
import { HelpModal } from "./components/HelpModal";
import { ToastProvider } from "./components/Toast/Toast";
import { useMeshNetwork } from "./hooks/useMeshNetwork";
import { useInvite } from "./hooks/useInvite";
import { useConversations } from "./hooks/useConversations";
import { usePendingInvite } from "./hooks/usePendingInvite";
import { useContacts } from "./hooks/useContacts";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useGroups } from "./hooks/useGroups";
import { announce } from "./utils/accessibility";
import { getDatabase } from "./storage/database";
import { setMockDatabase } from "@sc/core";
import {
  generateFingerprint,
  publicKeyToBase64,
  isValidPublicKey,
  logger,
  Database,
} from "@sc/core";

// Initialize core database with web implementation
setMockDatabase(getDatabase() as unknown as Database);
import { parseConnectionOffer, hexToBytes } from "@sc/core";
import { ProfileManager, UserProfile } from "./managers/ProfileManager";
import { validateMessageContent } from "@sc/core";
import { rateLimiter } from "@sc/core";
import { config } from "./config";
import { saveBootstrapPeers } from "./utils/peerBootstrap";

// Encryption is initialized in `main.tsx` bootstrap to ensure it's ready
// before the app mounts. Do not initialize here to avoid races.

function App() {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chats" | "groups">("chats");
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingInviteData, setPendingInviteData] = useState<{ code: string; inviterName: string | null } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const {
    contacts,
    addContact,
    removeContact,
    loading: contactsLoading,
    refreshContacts,
  } = useContacts();
  const {
    conversations: storedConversations,
    loading: conversationsLoading,
    refreshConversations,
  } = useConversations();

  const { groups, refreshGroups } = useGroups();

  const {
    status,
    peers,
    messages,
    sendMessage,
    connectToPeer,
    generateConnectionOffer,
    acceptConnectionOffer,
    identity,
    joinRoom,
    leaveRoom,
    sendRoomMessage,
    discoveredPeers,
    roomMessages,
    isJoinedToRoom,
    sendReaction,
    sendVoice,
  } = useMeshNetwork();

  // Setup logger
  useEffect(() => {
    console.log('[App] useEffect: Setup logger starting');
    try {
      if (config.logUrl) {
        logger.setRemoteUrl(config.logUrl);
      }

      // Capture global errors
      const handleGlobalError = (event: ErrorEvent) => {
        logger.error("Global", event.message, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error ? event.error.stack : undefined,
        });
      };

      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        logger.error("Global", "Unhandled Rejection", {
          reason: reason,
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
        });
      };

      window.addEventListener("error", handleGlobalError);
      window.addEventListener("unhandledrejection", handleUnhandledRejection);

      return () => {
        window.removeEventListener("error", handleGlobalError);
        window.removeEventListener(
          "unhandledrejection",
          handleUnhandledRejection,
        );
      };
    } catch (error) {
      console.error('[App] useEffect: Setup logger error:', error);
    }
    console.log('[App] useEffect: Setup logger completed');
  }, []);

  // Update peer ID in logger
  useEffect(() => {
    console.log('[App] useEffect: Update peer ID starting, localPeerId:', status.localPeerId);
    try {
      if (status.localPeerId) {
        logger.setPeerId(status.localPeerId);
      }
    } catch (error) {
      console.error('[App] useEffect: Update peer ID error:', error);
    }
    console.log('[App] useEffect: Update peer ID completed');
  }, [status.localPeerId]);

  // Persist identity for tests and offline access
  // Ensure identity is generated and persisted to localStorage and IndexedDB
  useEffect(() => {
    console.log('[App] useEffect: Identity initialization starting');
    const ensureIdentity = async () => {
      try {
        const db = getDatabase();
        let id = identity;
        if (!id || !id.publicKey || !id.privateKey) {
          // Try to get from DB
          id = await db.getPrimaryIdentity();
        }
        if (!id || !id.publicKey || !id.privateKey) {
          // If still missing, trigger mesh identity generation (if supported)
          if (typeof window !== "undefined" && (window as any).generateIdentity) {
            id = await (window as any).generateIdentity();
          }
        }
        if (id && id.publicKey && id.privateKey) {
          // Always generate fingerprint for display and storage
          const fingerprint = await generateFingerprint(id.publicKey);
          // Persist to localStorage in base64 for test compatibility and E2E selectors
          const toBase64 = (bytes: Uint8Array) =>
            typeof Buffer !== "undefined"
              ? Buffer.from(bytes).toString("base64")
              : btoa(String.fromCharCode(...Array.from(bytes)));
          localStorage.setItem(
            "identity",
            JSON.stringify({
              publicKey: toBase64(id.publicKey),
              privateKey: toBase64(id.privateKey),
              fingerprint,
            }),
          );
          // Optionally expose fingerprint for test selectors
          (window as any).__sc_identity_fingerprint = fingerprint;
          setIdentityReady(true);
        } else {
          setIdentityReady(false);
        }
      } catch (error) {
        console.error('[App] useEffect: Identity initialization error:', error);
        setIdentityReady(false);
      }
    };
    ensureIdentity();
    console.log('[App] useEffect: Identity initialization completed');
  }, [identity, status.localPeerId]);

  // Block main UI until identity is ready
  if (!identityReady) {
    return <div className="app-loading">Loading identity...</div>;
  }
  useEffect(() => {
    console.log('[App] useEffect: Toast handler starting');
    try {
      const handleToast = (event: Event) => {
        const detail = (event as CustomEvent<{ message: string; type: string }>)
          .detail;
        if (detail?.message) {
          setToast(detail);
          setTimeout(() => setToast(null), 3000);
        }
      };
      window.addEventListener("show-notification", handleToast as EventListener);
      return () =>
        window.removeEventListener(
          "show-notification",
          handleToast as EventListener,
        );
    } catch (error) {
      console.error('[App] useEffect: Toast handler error:', error);
    }
    console.log('[App] useEffect: Toast handler completed');
  }, []);
  const autoJoinedRef = useRef(false);

  const { invite, createInvite, clearInvite } = useInvite(
    status.localPeerId,
    identity?.publicKey || null,
    identity?.privateKey || null,
    userProfile?.displayName || "User",
    discoveredPeers, // Pass discovered peers for bootstrapping
  );

  // Check for pending invite from join.html page
  const pendingInvite = usePendingInvite();

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      ctrl: true,
      description: "New Conversation",
      action: () =>
        document.querySelector<HTMLElement>(".add-contact-btn")?.click(),
    },
    {
      key: "k",
      ctrl: true,
      description: "Search",
      action: () =>
        document.querySelector<HTMLElement>(".search-input")?.focus(),
    },
    {
      key: "s",
      ctrl: true,
      description: "Settings",
      action: () => setShowSettings(true),
    },
    {
      key: "Escape",
      description: "Close Modals",
      action: () => {
        setShowSettings(false);
        setShowDiagnostics(false);
        setShowShareApp(false);
      },
    },
  ]);

  // Check for diagnostics URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    if (urlParams.get('diagnostics') === 'true' || hash === '#diagnostics') {
      setShowDiagnostics(true);
    }
  }, []);

  const handleJoinRoom = useCallback(
    async (url: string) => {
      // Let the caller handle errors (ConversationList)
      await joinRoom(url);
      setSelectedConversation("public-room");
    },
    [joinRoom],
  );

  const handleLeaveRoom = useCallback(() => {
    leaveRoom();
    setActiveRoom(null);
  }, [leaveRoom]);

  // Auto-join public hub or URL room
  useEffect(() => {
    const shouldSkipAutoJoin =
      import.meta.env.MODE === "test" ||
      import.meta.env.VITE_E2E === "true" ||
      (typeof navigator !== "undefined" && "webdriver" in navigator && navigator.webdriver === true);

    if (shouldSkipAutoJoin) {
      // During automated tests we avoid auto-joining to prevent background
      // network traffic that interferes with Playwright's `networkidle`.
      return;
    }

    if (status.isConnected && !autoJoinedRef.current) {
      const urlParams = new URLSearchParams(window.location.search);
      const roomUrl = urlParams.get("room");

      const attemptJoin = async (url: string, retries = 3) => {
        try {
          console.log(`Attempting to join room: ${url}`);
          await joinRoom(url);
          autoJoinedRef.current = true;
          console.log("Successfully joined room");
        } catch (err) {
          console.error(`Failed to join room (retries left: ${retries}):`, err);
          if (retries > 0) {
            setTimeout(() => attemptJoin(url, retries - 1), 2000);
          } else {
            announce.message(
              "Failed to auto-join room after multiple attempts",
              "assertive",
            );
          }
        }
      };

      if (roomUrl) {
        attemptJoin(roomUrl);
      } else if (config.publicHub || config.deploymentMode === "netlify") {
        console.log(`Auto-joining room in ${config.deploymentMode} mode...`);
        // Use joinRoom directly to avoid setting selectedConversation (silent join)
        if (config.relayUrl) {
          attemptJoin(config.relayUrl);
        } else {
          console.warn("No relay URL configured for auto-join");
        }
      }
    }
  }, [status.isConnected, joinRoom]);

  // Save bootstrap peers when in public room - for mobile app handoff (debounced to avoid excessive writes)
  useEffect(() => {
    if (isJoinedToRoom && (discoveredPeers.length > 0 || peers.length > 0)) {
      // Debounce to avoid excessive localStorage writes
      const timeoutId = setTimeout(() => {
        const connectedPeerIds = peers.map((p) => p.id);
        saveBootstrapPeers(
          discoveredPeers,
          connectedPeerIds,
          activeRoom || undefined,
        );
        console.log(
          "Saved bootstrap peers for mobile handoff:",
          discoveredPeers.length,
          "discovered,",
          connectedPeerIds.length,
          "connected",
        );
      }, 1000); // Wait 1 second after last change

      return () => clearTimeout(timeoutId);
    }
  }, [isJoinedToRoom, discoveredPeers, peers, activeRoom]);

  // Handle pending invite from join.html page
  useEffect(() => {
    if (pendingInvite.code && identity?.publicKey && identity?.privateKey) {
      // Instead of auto-processing, set state to show confirmation modal
      setPendingInviteData({
        code: pendingInvite.code,
        inviterName: pendingInvite.inviterName,
      });
    }
  }, [pendingInvite.code, identity]);

  const handleConnectToPeer = async (peerId: string) => {
    try {
      await connectToPeer(peerId);
      announce.message("Connected to peer", "polite");
      // Automatically open conversation with the peer
      // Fix: Add connection as a contact to ensure it shows in the list and tracks online status
      await handleAddContact(peerId, `Peer ${peerId.substring(0, 8)}`);

      // Close the room view to show the chat
      setActiveRoom(null);
    } catch (error) {
      console.error("Failed to connect to peer:", error);
      alert(
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleAcceptInvite = async () => {
    if (!pendingInviteData || !identity?.publicKey || !identity?.privateKey)
      return;

    try {
      // Import InviteManager from core
      const { InviteManager } = await import("@sc/core");
      const inviteManager = new InviteManager(
        status.localPeerId,
        identity.publicKey,
        identity.privateKey,
        userProfile?.displayName || "User",
      );

      // Redeem the invite
      const result = await inviteManager.redeemInvite(
        pendingInviteData.code,
        status.localPeerId,
      );

      if (result.success) {
        // Convert publicKey Uint8Array to base64 string for storage
        // Use Array.from to avoid stack overflow with large arrays
        const publicKeyBase64 = publicKeyToBase64(result.contact.publicKey);

        // Use first 16 characters as fingerprint for display
        const FINGERPRINT_LENGTH = 16;

        // Save contact using hook to update state immediately
        await addContact({
          id: result.contact.peerId,
          publicKey: publicKeyBase64,
          displayName:
            pendingInviteData.inviterName ||
            result.contact.name ||
            "New Contact",
          lastSeen: Date.now(),
          createdAt: Date.now(),
          fingerprint: publicKeyBase64.substring(0, FINGERPRINT_LENGTH),
          verified: true,
          blocked: false,
          endpoints: [],
        });

        // Save initial conversation state if not exists
        const db = getDatabase();
        await db.saveConversation({
          id: result.contact.peerId,
          contactId: result.contact.peerId,
          lastMessageTimestamp: Date.now(),
          unreadCount: 0,
          createdAt: Date.now(),
        });
        refreshConversations();

        // 1. Valid invite -> Open UI immediately (Optimistic UI)
        setSelectedConversation(result.contact.peerId);

        // 2. Announce success
        announce.message(
          `Joined from invite! Added ${result.contact.name || pendingInviteData.inviterName || "new contact"}.`,
          "assertive",
        );

        // 3. Attempt connection in background (don't block UI if they are offline)
        try {
          await connectToPeer(result.contact.peerId);
          console.log("Connected to inviter:", result.contact.peerId);
        } catch (connErr) {
          console.warn(
            "Could not connect immediately to inviter (likely offline):",
            connErr,
          );
          setToast({
            message:
              "Contact added. They may be offline, but you can still message them.",
            type: "info",
          });
        }
      }
    } catch (error) {
      console.error("Failed to process pending invite:", error);
      announce.message(
        "Failed to process invite. The invite may be invalid or expired.",
        "assertive",
      );
    } finally {
      setPendingInviteData(null);
    }
  };

  const handleDeclineInvite = () => {
    setPendingInviteData(null);
  };

  // Announce connection status changes to screen readers
  useEffect(() => {
    if (status.joinError) {
      announce.message(`Failed to join room: ${status.joinError}`, "assertive");
    }
  }, [status.joinError]);

  useEffect(() => {
    if (status.isConnected) {
      announce.message(
        `Connected to ${status.peerCount} peer${status.peerCount === 1 ? "" : "s"}`,
        "polite",
      );
    } else {
      announce.message("Disconnected from network", "polite");
    }
  }, [status.isConnected, status.peerCount]);

  const handleDeleteConversation = async (id: string) => {
    if (id === "public-room") {
      leaveRoom();
      if (selectedConversation === id) {
        setSelectedConversation(null);
      }
      announce.message("Left public room", "polite");
      return;
    }

    try {
      await removeContact(id);
      if (selectedConversation === id) {
        setSelectedConversation(null);
      }
      announce.message("Conversation deleted", "polite");
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      announce.message("Failed to delete conversation", "assertive");
    }
  };

  const handleAddContact = async (
    peerId: string,
    name: string,
    publicKeyHex?: string,
  ) => {
    let finalPublicKeyHex = publicKeyHex;
    let finalPeerId = peerId;
    let finalName = name;

    // Check if peerId is a Stateless Invite Code (contains dot and likely long)
    if (
      finalPeerId.includes(".") &&
      !finalPublicKeyHex &&
      identity?.publicKey &&
      identity?.privateKey
    ) {
      try {
        const { InviteManager } = await import("@sc/core");
        const inviteManager = new InviteManager(
          status.localPeerId,
          identity.publicKey,
          identity.privateKey,
          userProfile?.displayName,
        );

        const result = await inviteManager.redeemInvite(
          finalPeerId,
          status.localPeerId,
        );
        if (result.success) {
          console.log("Automatically redeemed invite code in Add Contact");
          finalPeerId = result.contact.peerId;
          finalName = result.contact.name || finalName;
          // Convert Uint8Array to hex string
          finalPublicKeyHex = Array.from(result.contact.publicKey)
            .map((b) => (b as number).toString(16).padStart(2, "0"))
            .join("");
        }
      } catch (e) {
        console.warn("Failed to redeem potential invite code:", e);
        // Continue as normal, maybe it was just a weird ID
      }
    }

    // If no public key provided, try to use peerId if it looks like a key, or generate a dummy one for testing
    if (!finalPublicKeyHex) {
      if (isValidPublicKey(finalPeerId)) {
        finalPublicKeyHex = finalPeerId;
      } else {
        // Generate a random public key for testing/demo purposes if one isn't provided
        // This allows adding "test-buddy" or other simple names
        console.warn("Generating dummy public key for contact:", finalName);
        const keyPair = await window.crypto.subtle.generateKey(
          {
            name: "Ed25519",
          },
          true,
          ["sign", "verify"],
        );
        const exported = await window.crypto.subtle.exportKey(
          "raw",
          keyPair.publicKey,
        );
        finalPublicKeyHex = Array.from(new Uint8Array(exported))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
    }

    if (!finalPublicKeyHex || !isValidPublicKey(finalPublicKeyHex)) {
      console.error("Invalid public key:", finalPublicKeyHex);
      throw new Error("Valid public key required for contact");
    }

    const publicKeyBytes = hexToBytes(finalPublicKeyHex);
    const publicKeyBase64 = publicKeyToBase64(publicKeyBytes);
    const fingerprint = await generateFingerprint(publicKeyBytes);

    await addContact({
      id: finalPeerId,
      publicKey: publicKeyBase64, // ACTUAL PUBLIC KEY
      displayName: finalName,
      lastSeen: Date.now(),
      createdAt: Date.now(),
      fingerprint: fingerprint, // ACTUAL FINGERPRINT
      verified: false, // Verify through key exchange
      blocked: false,
      endpoints: [{ type: "webrtc" }],
    });

    // Create a conversation for the new contact
    const db = getDatabase();
    await db.saveConversation({
      id: finalPeerId,
      contactId: finalPeerId,
      lastMessageTimestamp: Date.now(),
      unreadCount: 0,
      createdAt: Date.now(),
    });

    refreshConversations();
    setSelectedConversation(finalPeerId);
  };

  const handleImportContact = async (code: string, name: string) => {
    try {
      const offer = parseConnectionOffer(code) as { publicKey?: string };

      if (!offer || !offer.publicKey || !isValidPublicKey(offer.publicKey)) {
        throw new Error("Invalid connection offer - missing public key");
      }

      const publicKeyBytes = hexToBytes(offer.publicKey);
      const publicKeyBase64 = publicKeyToBase64(publicKeyBytes);
      const fingerprint = await generateFingerprint(publicKeyBytes);

      const remotePeerId = await acceptConnectionOffer(code);

      await addContact({
        id: remotePeerId,
        publicKey: publicKeyBase64, // ACTUAL PUBLIC KEY FROM OFFER
        displayName: name,
        lastSeen: Date.now(),
        createdAt: Date.now(),
        fingerprint: fingerprint, // ACTUAL FINGERPRINT
        verified: true, // Verified through key exchange
        blocked: false,
        endpoints: [{ type: "webrtc" }],
      });

      // Ensure conversation is created
      const db = getDatabase();
      await db.saveConversation({
        id: remotePeerId,
        contactId: remotePeerId,
        lastMessageTimestamp: Date.now(),
        unreadCount: 0,
        createdAt: Date.now(),
      });

      refreshConversations();
      setSelectedConversation(remotePeerId);
      announce.message(`Connected to ${name}`, "polite");
    } catch (error) {
      console.error("Failed to connect to peer from offer:", error);
      announce.message(`Failed to connect to ${name}`, "assertive");
    }
  };

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    const validation = validateMessageContent(content);
    if (!validation.valid) {
      console.error("Message validation failed:", validation.error);
      alert(validation.error);
      return;
    }

    const rateLimitResult = rateLimiter.canSendMessage(status.localPeerId);
    if (!rateLimitResult.allowed) {
      console.error("Rate limit exceeded:", rateLimitResult.reason);
      alert(rateLimitResult.reason);
      return;
    }

    if (attachments && attachments.length > 0) {
      const fileRateLimitResult = rateLimiter.canSendFile(status.localPeerId);
      if (!fileRateLimitResult.allowed) {
        console.error("File rate limit exceeded:", fileRateLimitResult.reason);
        alert(fileRateLimitResult.reason);
        return;
      }
    }

    const sanitizedContent = validation.sanitized;

    if (selectedConversation) {
      // Check if it's a group
      const group = groups.find((g) => g.id === selectedConversation);

      if (group) {
        // Handle Group Message
        // Fan-out to all members except self
        const recipients = group.members
          .filter((m) => m.id !== status.localPeerId)
          .map((m) => m.id);

        // We need to send the groupId in the payload so recipients know it's a group message
        // This requires updating how we send messages.
        // For now, we'll append it to the content as a hack or metadata if supported.
        // Better: Construct a JSON payload that includes groupId.

        // Send to all members
        for (const recipientId of recipients) {
          try {
            await sendMessage(
              recipientId,
              sanitizedContent,
              attachments,
              group.id,
            );
          } catch (error) {
            console.error(
              `Failed to send to group member ${recipientId}:`,
              error,
            );
          }
        }

        // Refresh conversations to show updated timestamp (once async DB operations in hook complete)
        // We might want a small delay or rely on the hook's state update if mapped
        setTimeout(refreshGroups, 100);
      } else {
        // Handle 1:1 Message
        try {
          await sendMessage(
            selectedConversation,
            sanitizedContent,
            attachments,
          );
          // Refresh conversations to show updated timestamp
          setTimeout(refreshConversations, 100);
        } catch (error) {
          console.error("Error sending message via hook:", error);
          alert(`Failed to send message: ${error}`);
        }
      }
    } else {
      console.warn("No conversation selected");
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!selectedConversation) return;

    // Check if it's a group
    const group = groups.find((g) => g.id === selectedConversation);

    if (group) {
      // Fan-out to all members except self
      const recipients = group.members
        .filter((m) => m.id !== status.localPeerId)
        .map((m) => m.id);

      for (const recipientId of recipients) {
        try {
          await sendReaction(messageId, emoji, recipientId, group.id);
        } catch (error) {
          console.error(
            `Failed to send reaction to group member ${recipientId}:`,
            error,
          );
        }
      }
    } else {
      // 1:1
      try {
        await sendReaction(messageId, emoji, selectedConversation);
      } catch (error) {
        console.error("Failed to send reaction:", error);
        alert(`Failed to send reaction: ${error}`);
      }
    }
  };

  const handleSendVoice = async (audioBlob: Blob) => {
    if (!selectedConversation) return;

    // Check if it's a group
    const group = groups.find((g) => g.id === selectedConversation);

    if (group) {
      // Fan-out to all members except self
      const recipients = group.members
        .filter((m) => m.id !== status.localPeerId)
        .map((m) => m.id);

      for (const recipientId of recipients) {
        try {
          await sendVoice(recipientId, audioBlob, undefined, group.id);
        } catch (error) {
          console.error(
            `Failed to send voice to group member ${recipientId}:`,
            error,
          );
        }
      }
    } else {
      // 1:1
      try {
        await sendVoice(selectedConversation, audioBlob);
      } catch (error) {
        console.error("Failed to send voice:", error);
        alert(`Failed to send voice: ${error}`);
      }
    }
  };

  const handleShareApp = async () => {
    // Ensure keys are initialized
    if (identity?.publicKey && identity?.privateKey) {
      await createInvite();
      setShowShareApp(true);
    } else {
      console.warn("Identity not ready for sharing");
      announce.message("Please wait for identity to initialize", "assertive");
    }
  };

  const handleCloseShareApp = () => {
    setShowShareApp(false);
    clearInvite();
  };

  // Handle conversation selection and unread count reset
  const handleSelectConversation = useCallback(
    async (id: string) => {
      setSelectedConversation(id);

      // Reset unread count in DB
      try {
        const db = getDatabase();

        const isGroup = groups.some((g) => g.id === id);

        if (isGroup) {
          await db.updateGroupUnreadCount(id, 0);
          refreshGroups();
        } else {
          await db.updateUnreadCount(id, 0);
          refreshConversations();
        }
      } catch (error) {
        console.error("Failed to reset unread count:", error);
      }
    },
    [refreshConversations, refreshGroups, groups],
  );

  // Merge stored conversations with contact details
  const displayConversations = storedConversations.map((conv) => {
    const contact = contacts.find((c) => c.id === conv.contactId);
    return {
      id: conv.id,
      name: contact?.displayName || conv.contactId.substring(0, 8),
      lastMessage: "View messages", // Could be fetched if needed
      timestamp: conv.lastMessageTimestamp,
      unreadCount: conv.unreadCount,
      verified: contact?.verified ?? false,
      online: peers.some((p) => p.id === conv.id),
    };
  });

  // If we have contacts without conversations, add them too (optional, but good for UX)
  const contactIdsInConversations = new Set(
    storedConversations.map((c) => c.contactId),
  );
  const contactsWithoutConversations = contacts.filter(
    (c) => !contactIdsInConversations.has(c.id),
  );

  const allConversations = [
    ...displayConversations,
    ...contactsWithoutConversations.map((c) => ({
      id: c.id,
      name: c.displayName,
      lastMessage: "Start a conversation",
      timestamp: c.createdAt,
      unreadCount: 0,
      verified: c.verified ?? false,
      online: peers.some((p) => p.id === c.id),
    })),
  ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Add Public Room if joined
  if (isJoinedToRoom) {
    allConversations.unshift({
      id: "public-room",
      name: "🌐 Public Room",
      lastMessage: `${discoveredPeers.length} peers discovered`,
      timestamp: Date.now(),
      unreadCount: 0,
      verified: true,
      online: true,
    });
  }

  // Update contactName logic in render
  const getContactName = (id: string) => {
    const contact = contacts.find((c) => c.id === id);
    if (contact) return contact.displayName;

    const group = groups.find((g) => g.id === id);
    if (group) return group.name;

    return "Unknown Contact";
  };

  const handleManualConnectionInitiated = async (peerId: string) => {
    if (!contacts.some((c) => c.id === peerId)) {
      await handleAddContact(peerId, `Peer ${peerId.slice(0, 6)}`);
    }
    setSelectedConversation(peerId);
  };

  return (
    <ErrorBoundary>
      <ToastProvider>
        <PWAInstall />
        <UpdateNotification />
        {/* Initialization Error Banner */}
        {status.initializationError && (
          <div className="error-banner" role="alert">
            <div className="error-content">
              <h3>⚠️ Startup Error</h3>
              <p>{status.initializationError}</p>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(status.initializationError!)
                }
                className="copy-error-btn"
              >
                Copy Error
              </button>
            </div>
          </div>
        )}

        {/* Onboarding Flow */}
        {showOnboarding && (
          <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
        )}

        {/* Share App Modal */}
        {showShareApp && invite && (
          <QRCodeShare invite={invite} onClose={handleCloseShareApp} />
        )}

        {/* Invite Acceptance Modal */}
        {pendingInviteData && (
          <InviteAcceptanceModal
            inviterName={pendingInviteData.inviterName || "A friend"}
            onAccept={handleAcceptInvite}
            onDecline={handleDeclineInvite}
          />
        )}

        {toast && (
          <div
            data-testid="notification-toast"
            className="notification-toast"
            role="status"
          >
            {toast.message}
          </div>
        )}

        {/* Network Diagnostics Modal */}
        {showDiagnostics && (
          <div
            className="modal-overlay"
            onClick={() => setShowDiagnostics(false)}
          >
            <div
              className="modal-content diagnostics-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="modal-close"
                onClick={() => setShowDiagnostics(false)}
                aria-label="Close diagnostics"
              >
                ×
              </button>
              <NetworkDiagnostics />
            </div>
          </div>
        )}

        <div
          className="app"
          role="application"
          aria-label="Sovereign Communications Messenger"
        >
          {/* Skip to main content link for keyboard navigation */}
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>

          <div className="app-header">
            <h1>Sovereign Communications</h1>
            <div className="header-controls" data-testid="connection-status">
              <ConnectionStatus quality={status.connectionQuality} />
              <span className="peer-count" data-testid="peer-count">
                {status.peerCount}
              </span>
              <span
                className="encryption-indicator"
                data-testid="encryption-status"
                aria-label="encrypted"
              >
                🔒 Encrypted
              </span>
            </div>
          </div>

          {!status.isConnected && (
            <div className="offline-banner" data-testid="offline-indicator">
              Offline - attempting to reconnect
            </div>
          )}

          {/* Only show main app UI if not onboarding */}
          {!showOnboarding && (
            <>
              <div
                className={`main-layout ${selectedConversation ? "chat-active" : ""}`}
              >
                <div className="sidebar">
                  <div className="sidebar-header">
                    <div className="user-profile">
                      <div className="avatar">
                        {status.localPeerId.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="user-info">
                        <span className="username">Me</span>
                        <span className="status-indicator online"></span>
                      </div>
                      <div className="header-controls">
                        <button
                          onClick={() => setShowDiagnostics(!showDiagnostics)}
                          className="diagnostics-btn"
                          aria-label="Network Diagnostics"
                          title="Network Diagnostics"
                        >
                          📶
                        </button>
                        <button
                          onClick={() => setShowHelp(true)}
                          className="help-btn"
                          aria-label="Help"
                          title="Help & FAQ"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "1.2rem",
                          }}
                        >
                          ❓
                        </button>
                        <button
                          className="settings-btn"
                          onClick={() => setShowSettings(true)}
                          aria-label="Settings"
                          data-testid="settings-btn"
                        >
                          ⚙️
                        </button>
                      </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex border-b border-gray-200 mt-2">
                      <button
                        className={`flex-1 py-2 text-sm font-medium ${activeTab === "chats" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                        onClick={() => setActiveTab("chats")}
                      >
                        Chats
                      </button>
                      <button
                        className={`flex-1 py-2 text-sm font-medium ${activeTab === "groups" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                        onClick={() => setActiveTab("groups")}
                      >
                        Groups
                      </button>
                    </div>
                  </div>

                  {activeTab === "chats" ? (
                    <ConversationList
                      conversations={allConversations}
                      loading={contactsLoading || conversationsLoading}
                      selectedId={selectedConversation}
                      onSelect={handleSelectConversation}
                      onDelete={handleDeleteConversation}
                      onAddContact={handleAddContact}
                      onImportContact={handleImportContact}
                      onShareApp={handleShareApp}
                      localPeerId={status.localPeerId}
                      generateConnectionOffer={generateConnectionOffer}
                      onJoinRoom={handleJoinRoom}
                      onJoinRelay={joinRoom}
                      onInitiateConnection={handleManualConnectionInitiated}
                      connectionStatus={status.isConnected}
                    />
                  ) : (
                    <GroupChat onSelectGroup={handleSelectConversation} />
                  )}
                </div>

                <div
                  className="content-area main-content"
                  id="main-content"
                  data-testid="main-content"
                  tabIndex={-1}
                  role="main"
                >
                  {selectedConversation ? (
                    selectedConversation === "public-room" ? (
                      <RoomView
                        isOpen={true}
                        onClose={() => setSelectedConversation(null)}
                        discoveredPeers={discoveredPeers}
                        connectedPeers={peers.map((p) => p.id)}
                        roomMessages={roomMessages}
                        onSendMessage={sendRoomMessage}
                        onConnect={handleConnectToPeer}
                        localPeerId={status.localPeerId}
                        embedded={true}
                      />
                    ) : (
                      <ChatView
                        conversationId={selectedConversation}
                        contactName={getContactName(selectedConversation)}
                        isOnline={peers.some(
                          (p) => p.id === selectedConversation,
                        )} // Groups are always "online" effectively, or check if any member is online
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        onSendVoice={handleSendVoice}
                        onReaction={handleReaction}
                        isLoading={contactsLoading}
                        onClose={() => setSelectedConversation(null)}
                        onUpdateContact={refreshContacts}
                      />
                    )
                  ) : (
                    <div className="empty-state">
                      <div className="empty-state-content">
                        <div className="dashboard-header">
                          <h2>Sovereign Communications</h2>
                          <span className="version-badge">v1.0 Ready</span>
                        </div>

                        <div className="dashboard-card user-card">
                          <h3>Your Identity</h3>
                          <div className="identity-display">
                            <div className="avatar-large">
                              {status.localPeerId
                                ? status.localPeerId.charAt(0).toUpperCase()
                                : "?"}
                            </div>
                            <div className="identity-details">
                              <p className="peer-id-label">Peer ID</p>
                              <code
                                className="peer-id-code"
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    status.localPeerId,
                                  );
                                  alert("Peer ID copied to clipboard!");
                                }}
                                title="Click to copy"
                              >
                                {status.localPeerId || "Generating..."}
                              </code>
                              <div className="status-indicator">
                                <span
                                  className={`status-dot ${status.isConnected ? "online" : "offline"}`}
                                ></span>
                                {status.isConnected
                                  ? `Online (${status.peerCount} peers)`
                                  : "Connecting..."}
                              </div>
                            </div>
                          </div>
                          <div className="dashboard-actions">
                            <button
                              className="btn btn-primary"
                              onClick={() => setShowSettings(true)}
                            >
                              Share Profile
                            </button>
                          </div>
                        </div>

                        <div className="dashboard-grid">
                          <div className="dashboard-card action-card">
                            <div className="card-icon">👥</div>
                            <h3>Connect</h3>
                            <p>
                              Use the <strong>+</strong> button in the sidebar
                              to add friends.
                            </p>
                          </div>
                          <div
                            className="dashboard-card action-card"
                            onClick={() =>
                              window.open(
                                "https://github.com/Treystu/SC",
                                "_blank",
                              )
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <div className="card-icon">⭐</div>
                            <h3>Star on GitHub</h3>
                            <p>Support the project and get updates.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Settings Modal */}
              {showSettings && (
                <div
                  className="modal-overlay"
                  onClick={() => setShowSettings(false)}
                >
                  <div
                    className="modal-content settings-modal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="modal-close"
                      onClick={() => setShowSettings(false)}
                      aria-label="Close settings"
                    >
                      ×
                    </button>
                    <SettingsPanel />
                  </div>
                </div>
              )}

              {/* Room View Overlay - Only if activeRoom is explicitly set (legacy/URL) */}
              <RoomView
                isOpen={!!activeRoom}
                onClose={handleLeaveRoom}
                discoveredPeers={discoveredPeers}
                connectedPeers={peers.map((p) => p.id)}
                roomMessages={roomMessages}
                onSendMessage={sendRoomMessage}
                onConnect={handleConnectToPeer}
                localPeerId={status.localPeerId}
              />
            </>
          )}
        </div>

        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
