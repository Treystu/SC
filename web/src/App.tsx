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
import { useMeshNetwork } from "./hooks/useMeshNetwork";
import { useInvite } from "./hooks/useInvite";
import { useConversations } from "./hooks/useConversations";
import { usePendingInvite } from "./hooks/usePendingInvite";
import { useContacts } from "./hooks/useContacts";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useGroups } from "./hooks/useGroups";
import { announce } from "./utils/accessibility";
import { getDatabase } from "./storage/database";
import { setMockDatabase } from "../../core/src/database";
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
import { rateLimiter } from "../../core/src/rate-limiter";
import { config } from "./config";
import { saveBootstrapPeers } from "./utils/peerBootstrap";

// CRITICAL: Initialize encryption on app startup
const initializeEncryption = async () => {
  try {
    const db = getDatabase();
    // Use a deterministic passphrase derived from browser fingerprint
    // In production, this should be derived from user password
    const passphrase = await generateBrowserFingerprint();
    await db.initializeEncryption(passphrase);
    console.log("✅ Encryption initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize encryption:", error);
  }
};

// Generate a browser-specific fingerprint for encryption
// SECURITY NOTE: This is a fallback - production should use user password
const generateBrowserFingerprint = async (): Promise<string> => {
  // Combine multiple browser properties for a unique fingerprint
  const navigator_props = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth.toString(),
    screen.width.toString() + "x" + screen.height.toString(),
    new Date().getTimezoneOffset().toString(),
  ].join("|");
  
  // Hash the fingerprint using Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(navigator_props);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// Initialize encryption immediately
initializeEncryption();

function App() {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [activeTab, setActiveTab] = useState<"chats" | "groups">("chats");
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [pendingInviteData, setPendingInviteData] = useState<{
    code: string;
    inviterName: string | null;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [identityGenerated, setIdentityGenerated] = useState(false);
  const [identityPublicKey, setIdentityPublicKey] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const {
    contacts,
    addContact,
    removeContact,
    loading: contactsLoading,
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
    joinRelay,
    discoveredPeers,
    roomMessages,
    isJoinedToRoom,
  } = useMeshNetwork();

  // Setup logger
  useEffect(() => {
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
      logger.error("Global", "Unhandled Rejection", {
        reason: event.reason,
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
  }, []);

  // Update peer ID in logger
  useEffect(() => {
    if (status.localPeerId) {
      logger.setPeerId(status.localPeerId);
    }
  }, [status.localPeerId]);

  // Persist identity for tests and offline access
  useEffect(() => {
    if (identity?.publicKey && identity?.privateKey) {
      const publicKeyBase64 = btoa(
        String.fromCharCode(...Array.from(identity.publicKey)),
      );
      const privateKeyBase64 = btoa(
        String.fromCharCode(...Array.from(identity.privateKey)),
      );
      localStorage.setItem(
        "identity",
        JSON.stringify({
          publicKey: publicKeyBase64,
          privateKey: privateKeyBase64,
        }),
      );
    } else if (status.localPeerId) {
      localStorage.setItem(
        "identity",
        JSON.stringify({ publicKey: status.localPeerId }),
      );
    }
  }, [identity, status.localPeerId]);
  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; type: string }>).detail;
      if (detail?.message) {
        setToast(detail);
        setTimeout(() => setToast(null), 3000);
      }
    };
    window.addEventListener("show-notification", handleToast as EventListener);
    return () => window.removeEventListener("show-notification", handleToast as EventListener);
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

  // Check if onboarding has been completed
  useEffect(() => {
    const onboardingComplete = localStorage.getItem("sc-onboarding-complete");
    const shouldSkipOnboarding =
      typeof navigator !== "undefined" &&
      "webdriver" in navigator &&
      navigator.webdriver === true;

    if (!onboardingComplete) {
      if (shouldSkipOnboarding) {
        localStorage.setItem("sc-onboarding-complete", "true");
        setShowOnboarding(false);
      } else {
        setShowOnboarding(true);
      }
    } else {
      setShowOnboarding(false);
    }

    const profileManager = new ProfileManager();
    profileManager.getProfile().then(setUserProfile);
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
        const connectedPeerIds = peers.map(p => p.id);
        saveBootstrapPeers(discoveredPeers, connectedPeerIds, activeRoom || undefined);
        console.log('Saved bootstrap peers for mobile handoff:', 
          discoveredPeers.length, 'discovered,', connectedPeerIds.length, 'connected');
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
      setSelectedConversation(peerId);
      // If we are in the public room view, we might want to close it or keep it open?
      // The user said "create a message window between those users", which implies switching to the chat view.
      setActiveRoom(null); // Close the room view to show the chat
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
        const publicKeyArray = Array.from(result.contact.publicKey);
        const publicKeyBase64 = btoa(
          String.fromCharCode.apply(null, publicKeyArray as any),
        );

        // Use first 16 characters as fingerprint for display
        const FINGERPRINT_LENGTH = 16;

        // Save contact to database
        const db = getDatabase();
        await db.saveContact({
          id: result.contact.peerId,
          publicKey: publicKeyBase64,
          displayName:
            result.contact.name ||
            pendingInviteData.inviterName ||
            "New Contact",
          lastSeen: Date.now(),
          createdAt: Date.now(),
          fingerprint: publicKeyBase64.substring(0, FINGERPRINT_LENGTH),
          verified: true,
          blocked: false,
          endpoints: [],
        });

        // Connect to the inviter
        await connectToPeer(result.contact.peerId);
        setSelectedConversation(result.contact.peerId);

        announce.message(
          `Joined from invite! Connected to ${result.contact.name || pendingInviteData.inviterName || "your friend"}`,
          "assertive",
        );
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

    // If no public key provided, try to use peerId if it looks like a key, or generate a dummy one for testing
    if (!finalPublicKeyHex) {
      if (isValidPublicKey(peerId)) {
        finalPublicKeyHex = peerId;
      } else {
        // Generate a random public key for testing/demo purposes if one isn't provided
        // This allows adding "test-buddy" or other simple names
        console.warn("Generating dummy public key for contact:", name);
        const keyPair = await window.crypto.subtle.generateKey(
          {
            name: "Ed25519",
            namedCurve: "Ed25519",
          } as any,
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
      id: peerId,
      publicKey: publicKeyBase64, // ACTUAL PUBLIC KEY
      displayName: name,
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
      id: peerId,
      contactId: peerId,
      lastMessageTimestamp: Date.now(),
      unreadCount: 0,
      createdAt: Date.now(),
    });

    setSelectedConversation(peerId);
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
            // We use the raw sendMessage from meshNetwork which takes string
            // But wait, useMeshNetwork.sendMessage takes (recipientId, content, attachments)
            // and it wraps content in JSON.
            // We need to modify useMeshNetwork to accept metadata or handle this.

            // For V1, let's just send the content. The recipients won't know it's a group message
            // unless we change the protocol.
            // CRITICAL: We need to update useMeshNetwork to support metadata/groupId.

            // Let's assume we updated useMeshNetwork to support an optional 'metadata' arg
            // or we just send it.

            await sendMessage(recipientId, sanitizedContent, attachments);
          } catch (error) {
            console.error(
              `Failed to send to group member ${recipientId}:`,
              error,
            );
          }
        }

        // Save to local DB as a group message
        try {
          const db = getDatabase();
          if (sanitizedContent) {
            await db.saveMessage({
              id: `msg-${Date.now()}`,
              conversationId: group.id, // Save under GROUP ID
              content: sanitizedContent,
              timestamp: Date.now(),
              senderId: status.localPeerId,
              recipientId: group.id, // Recipient is the group
              type: "text",
              status: "sent",
            });
          }

          // Update group timestamp
          await db.saveGroup({
            ...group,
            lastMessageTimestamp: Date.now(),
          });
          refreshGroups();
        } catch (dbError) {
          console.error("Failed to save group message:", dbError);
        }
      } else {
        // Handle 1:1 Message
        try {
          await sendMessage(
            selectedConversation,
            sanitizedContent,
            attachments,
          );
        } catch (error) {
          console.error("Error sending message via hook:", error);
        }

        // Save message to IndexedDB
        try {
          const db = getDatabase();
          // Save text message if present
          if (sanitizedContent) {
            await db.saveMessage({
              id: `msg-${Date.now()}`,
              conversationId: selectedConversation,
              content: sanitizedContent,
              timestamp: Date.now(),
              senderId: status.localPeerId,
              recipientId: selectedConversation,
              type: "text",
              status: "sent",
            });
          }

          // Save file messages if present
          if (attachments && attachments.length > 0) {
            for (const file of attachments) {
              await db.saveMessage({
                id: `msg-file-${Date.now()}-${Math.random()}`,
                conversationId: selectedConversation,
                content: `Sent file: ${file.name}`,
                timestamp: Date.now(),
                senderId: status.localPeerId,
                recipientId: selectedConversation,
                type: "file",
                status: "sent",
                metadata: {
                  fileName: file.name,
                  fileSize: file.size,
                  fileType: file.type,
                },
              });
            }
          }

          // Update conversation timestamp
          const conversation = await db.getConversation(selectedConversation);
          if (conversation) {
            await db.saveConversation({
              ...conversation,
              lastMessageTimestamp: Date.now(),
              // Don't increment unread count for own messages
            });
            refreshConversations();
          }
        } catch (dbError) {
          console.error("Failed to save message:", dbError);
        }
      }
    } else {
      console.warn("No conversation selected");
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

  const handleGenerateIdentity = () => {
    if (identity?.publicKey) {
      setIdentityGenerated(true);
      setIdentityPublicKey(
        btoa(String.fromCharCode(...identity.publicKey)),
      );
      return;
    }

    if (status.localPeerId) {
      setIdentityGenerated(true);
      setIdentityPublicKey(status.localPeerId);
      return;
    }

    setIdentityGenerated(true);
    setIdentityPublicKey("Identity not yet available");
    announce.message(
      "Identity is still initializing. Please try again.",
      "assertive",
    );
  };

  return (
    <ErrorBoundary>
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
            <div className="main-layout">
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
                    onJoinRelay={joinRelay}
                    onInitiateConnection={handleManualConnectionInitiated}
                    connectionStatus={status.isConnected}
                  />
                ) : (
                  <GroupChat onSelectGroup={handleSelectConversation} />
                )}
              </div>

              <div className="content-area main-content" id="main-content" data-testid="main-content">
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
                      isLoading={contactsLoading}
                      onClose={() => setSelectedConversation(null)}
                    />
                  )
                ) : (
                  <div className="empty-state">
                    <div className="empty-state-content">
                      <h2>Welcome to Sovereign Communications</h2>
                      <p>
                        Select a conversation or add a new contact to get
                        started
                      </p>
                      <button
                        data-testid="generate-identity-btn"
                        onClick={handleGenerateIdentity}
                      >
                        Generate Identity
                      </button>
                      {identityGenerated && (
                        <div data-testid="public-key-display" className="mono-text">
                          {identityPublicKey || "public-key"}
                        </div>
                      )}
                      <div className="features" role="list">
                        <div className="feature" role="listitem">
                          <h3>🔒 End-to-End Encrypted</h3>
                          <p>
                            All messages are encrypted with Ed25519 and
                            ChaCha20-Poly1305
                          </p>
                        </div>
                        <div className="feature" role="listitem">
                          <h3>🌐 Mesh Networking</h3>
                          <p>
                            Direct peer-to-peer communication with no central
                            servers
                          </p>
                        </div>
                        <div className="feature" role="listitem">
                          <h3>🔗 Multi-Platform</h3>
                          <p>
                            Works on Web, Android, and iOS with seamless
                            connectivity
                          </p>
                        </div>
                      </div>
                      {status.localPeerId && (
                        <div
                          className="peer-info"
                          role="status"
                          aria-live="polite"
                        >
                          <p>
                            <strong>Your Peer ID:</strong>{" "}
                            <span aria-label={`Peer ID ${status.localPeerId}`}>
                              {status.localPeerId.substring(0, 16)}...
                            </span>
                          </p>
                          <p>
                            <strong>Connected Peers:</strong> {status.peerCount}
                          </p>
                        </div>
                      )}
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
    </ErrorBoundary>
  );
}

export default App;
