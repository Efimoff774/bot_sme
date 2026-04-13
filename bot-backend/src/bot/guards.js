export function isPrivateChat(ctx) {
  return ctx?.chat?.type === 'private';
}

/**
 * Global guard:
 * - Private chats: allow
 * - Groups/supergroups/channels: ignore everything (silent)
 */
export async function privateChatOnlyGuard(ctx, next) {
  if (isPrivateChat(ctx)) return next();

  const chatType = ctx?.chat?.type;
  if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
    return;
  }

  return;
}

