const SEEN_KEY = 'veravo_welcome_seen'

export function hasSeenWelcomeGuide() {
  return localStorage.getItem(SEEN_KEY) === '1'
}

export function markWelcomeGuideSeen() {
  localStorage.setItem(SEEN_KEY, '1')
}
