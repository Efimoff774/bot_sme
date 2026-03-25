import { db } from './sqlite.js';

// Returns all teams sorted by name for selection keyboards.
export async function getAllTeams() {
  const stmt = await db.prepare('select id, name from teams order by name asc');
  return stmt.all();
}

export async function getTeamById(id) {
  const stmt = await db.prepare('select id, name from teams where id = ?');
  return stmt.get(id);
}

