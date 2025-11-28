import { useState, useEffect } from 'react';
import { getDatabase, StoredGroup } from '../storage/database';
import { ProfileManager } from '../managers/ProfileManager';
export function GroupChat() {
  const [groups, setGroups] = useState<StoredGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const db = getDatabase();
      const loadedGroups = await db.getGroups();
      setGroups(loadedGroups);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      const db = getDatabase();
      const profileManager = new ProfileManager();
      const profile = await profileManager.getProfile();
      const newGroup: StoredGroup = {
        id: crypto.randomUUID(),
        name: newGroupName.trim(),
        members: [], // In a real app, add self and selected contacts
        createdBy: profile.fingerprint,
        createdAt: Date.now(),
        lastMessageTimestamp: Date.now()
      };

      await db.saveGroup(newGroup);
      setGroups(prev => [newGroup, ...prev]);
      setNewGroupName('');
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create group:', error);
      alert('Failed to create group');
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
          groups.map(group => (
            <div key={group.id} className="group-item p-4 bg-white rounded-lg shadow border hover:border-blue-300 transition-colors cursor-pointer">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{group.name}</h3>
                  <p className="text-sm text-gray-500">{group.members.length} members</p>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(group.lastMessageTimestamp).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Group</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group Name"
              className="w-full p-2 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
