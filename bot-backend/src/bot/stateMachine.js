// Simple per-user state machine persisted in local SQLite DB.
// States:
// - idle
// - registering_first_name
// - registering_last_name
// - registering_team
// - awaiting_avatar
// - waiting_participation_choice
// - lifestyle_general_text
// - lifestyle_photos
// - work_general_text
// - work_photos
// - confirm_submission

import { db } from '../db/sqlite.js';

const TABLE = 'user_states';

export async function getUserState(userId) {
  try {
    const stmt = await db.prepare(
      `select user_id, state, context from ${TABLE} where user_id = ?`
    );
    const row = stmt.get(userId);

    if (!row) {
      return { user_id: userId, state: 'idle', context: {} };
    }

    let context = {};
    if (row.context) {
      try {
        context = JSON.parse(row.context);
      } catch {
        context = {};
      }
    }

    return { user_id: row.user_id, state: row.state, context };
  } catch (error) {
    console.error('[stateMachine] getUserState error', error);
    throw error;
  }
}

export async function setUserState(userId, state, context = {}) {
  try {
    const contextStr = JSON.stringify(context ?? {});
    const stmt = await db.prepare(
      `insert into ${TABLE} (user_id, state, context)
       values (?, ?, ?)
       on conflict(user_id) do update set state = excluded.state, context = excluded.context`
    );
    stmt.run(userId, state, contextStr);
  } catch (error) {
    console.error('[stateMachine] setUserState error', error);
    throw error;
  }
}

export async function resetUserState(userId) {
  return setUserState(userId, 'idle', {});
}

