import { useState } from 'react';

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
  const [groups] = useState<Group[]>([]);

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

      <button onClick={() => alert('Create group functionality coming soon')}>
        Create Group
      </button>
    </div>
  );
}
