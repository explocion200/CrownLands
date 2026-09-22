"use strict";

// Deleting a large document also removes its index entries. A legal write count
// can still exceed Firestore's byte limit; split only that specific failure.
async function deleteMaintenanceDocuments(db, documents) {
  async function commit(rows) {
    if (!rows.length) return;
    const batch = db.batch();
    rows.forEach(doc => batch.delete(doc.ref));
    try {
      await batch.commit();
    } catch (error) {
      if (rows.length < 2 || !/transaction too big|maximum.*(?:transaction|request).*size|request.*exceeds.*size/i.test(String(error.message))) throw error;
      const middle = Math.ceil(rows.length / 2);
      await commit(rows.slice(0, middle));
      await commit(rows.slice(middle));
    }
  }
  for (let index = 0; index < documents.length; index += 50) await commit(documents.slice(index, index + 50));
}

module.exports = { deleteMaintenanceDocuments };
