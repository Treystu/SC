import { useState, useEffect, useCallback } from "react";
import { getDatabase, StoredGroup } from "../storage/database";

export function useGroups() {
  const [groups, setGroups] = useState<StoredGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    try {
      const db = getDatabase();
      const storedGroups = await db.getGroups();
      setGroups(storedGroups);
    } catch (error) {
      console.error("Failed to load groups:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();

    // Refresh periodically
    const interval = setInterval(loadGroups, 5000);
    return () => clearInterval(interval);
  }, [loadGroups]);

  return { groups, loading, refreshGroups: loadGroups };
}
