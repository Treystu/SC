import { useState, useEffect } from "react";
import { getDatabase, StoredGroup } from "../storage/database";
import { ProfileManager } from "../managers/ProfileManager";
import { useContacts } from "../hooks/useContacts";
import { CreateGroupDialog } from "./CreateGroupDialog";

interface GroupChatProps {
  onSelectGroup?: (groupId: string) => void;
}

export function GroupChat({ onSelectGroup }: GroupChatProps) {
  const [groups, setGroups] = useState<StoredGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { contacts } = useContacts();

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const db = getDatabase();
      const loadedGroups = await db.getGroups();
      setGroups(loadedGroups);
    } catch (error) {
      console.error("Failed to load groups:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGroup = async (name: string, members: string[]) => {
    try {
      const db = getDatabase();
      const profileManager = new ProfileManager();
      const profile = await profileManager.getProfile();
      const newGroup: StoredGroup = {
        id: crypto.randomUUID(),
        name: name.trim(),
        members: [
          { id: profile.fingerprint, name: "You", isAdmin: true },
          ...members.map((id) => {
            const contact = contacts.find((c) => c.id === id);
            return {
              id,
              name: contact?.displayName || "Unknown",
              isAdmin: false,
            };
          }),
        ],
        createdBy: profile.fingerprint,
        createdAt: Date.now(),
        lastMessageTimestamp: Date.now(),
      };

      await db.saveGroup(newGroup);
      setGroups((prev) => [newGroup, ...prev]);
      setShowCreateModal(false);
    } catch (error) {
      console.error("Failed to create group:", error);
      alert("Failed to create group");
      throw error;
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center">Loading groups...</div>;
  }

  return (
    <div className="group-chat h-full flex flex-col">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-semibold">Groups</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          New Group
        </button>
      </div>

      <div className="groups-list flex-1 overflow-y-auto p-4 space-y-4">
        {groups.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            No groups yet. Create one to get started!
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className="group-item p-4 bg-white rounded-lg shadow border hover:border-blue-300 transition-colors cursor-pointer"
              onClick={() => onSelectGroup?.(group.id)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{group.name}</h3>
                  <p className="text-sm text-gray-500">
                    {group.members.length} members
                  </p>
                </div>
                {group.unreadCount && group.unreadCount > 0 && (
                  <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full mr-2">
                    {group.unreadCount}
                  </div>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(group.lastMessageTimestamp).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <CreateGroupDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateGroup}
      />
    </div>
  );
}
