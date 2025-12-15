import React, { useState } from "react";
import { useContacts } from "../hooks/useContacts";

interface CreateGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => Promise<void>;
}

export const CreateGroupDialog: React.FC<CreateGroupDialogProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const { contacts } = useContacts();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreate(newGroupName, selectedMembers);
      onClose();
      setNewGroupName("");
      setSelectedMembers([]);
    } catch (error) {
      console.error("Error creating group:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMember = (contactId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId],
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "400px" }}
      >
        <h3 className="text-lg font-semibold mb-4">Create New Group</h3>

        <div className="form-group">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Group Name
          </label>
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="e.g. Project Alpha"
            className="w-full p-2 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            autoFocus
          />
        </div>

        <div className="mb-4">
          <h4 className="font-medium mb-2 text-sm text-gray-700">
            Select Members
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
            {contacts.length === 0 ? (
              <p className="text-sm text-gray-500 p-2">
                No contacts available to add.
              </p>
            ) : (
              contacts.map((contact) => (
                <label
                  key={contact.id}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-gray-200 p-2 rounded transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(contact.id)}
                    onChange={() => toggleMember(contact.id)}
                    className="rounded text-blue-600 w-4 h-4"
                  />
                  <span className="text-sm font-medium">
                    {contact.displayName}
                  </span>
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {selectedMembers.length} member
            {selectedMembers.length !== 1 ? "s" : ""} selected
          </p>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!newGroupName.trim() || isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
};
