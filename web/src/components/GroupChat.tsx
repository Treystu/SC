import React, { useState } from 'react';

interface GroupMember {
  id: string;
  name: string;
  isAdmin: boolean;
}

interface Group {
  id: string;
  name: string;
  members: GroupMember[];
  createdBy: string;
  createdAt: number;
}

export function GroupChat() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const createGroup = (name: string, memberIds: string[]) => {
    const newGroup: Group = {
      id: crypto.randomUUID(),
      name,
      members: memberIds.map(id => ({
        id,
        name: `User ${id}`,
        isAdmin: false
      })),
      createdBy: 'current-user',
      createdAt: Date.now()
    };

    setGroups([...groups, newGroup]);
    setShowCreateDialog(false);
  };

  const addMember = (groupId: string, userId: string) => {
    setGroups(groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          members: [...group.members, {
            id: userId,
            name: `User ${userId}`,
            isAdmin: false
          }]
        };
      }
      return group;
    }));
  };

  const removeMember = (groupId: string, userId: string) => {
    setGroups(groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          members: group.members.filter(m => m.id !== userId)
        };
      }
      return group;
    }));
  };

  const promoteToAdmin = (groupId: string, userId: string) => {
    setGroups(groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          members: group.members.map(m =>
            m.id === userId ? { ...m, isAdmin: true } : m
          )
        };
      }
      return group;
    }));
  };

  return (
    <div className="group-chat">
      <div className="groups-list">
        {groups.map(group => (
          <div key={group.id} className="group-item">
            <h3>{group.name}</h3>
            <p>{group.members.length} members</p>
            <div className="members">
              {group.members.map(member => (
                <div key={member.id} className="member">
                  {member.name}
                  {member.isAdmin && <span className="admin-badge">Admin</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setShowCreateDialog(true)}>
        Create Group
      </button>
    </div>
  );
}
