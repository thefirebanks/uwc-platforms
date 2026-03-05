type RowWithOptionalId = {
  id?: string;
};

export function partitionConfigRowsById<T extends RowWithOptionalId>(rows: T[]) {
  const inserts: Omit<T, "id">[] = [];
  const updates: T[] = [];

  for (const row of rows) {
    if ("id" in row && typeof row.id === "string" && row.id.length > 0) {
      updates.push(row);
      continue;
    }

    const insertRow = { ...row };
    delete insertRow.id;
    inserts.push(insertRow as Omit<T, "id">);
  }

  return { inserts, updates };
}
