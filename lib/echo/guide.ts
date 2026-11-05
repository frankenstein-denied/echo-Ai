// The "How Echo works" walkthrough. Keep it true to the UI, at most 10 slides, and led by what Echo is for:
// people treated Echo as a general chatbot, so the purpose comes before any feature. Screens in public/guide
// are the real pages running on fictional sample data.
export const WEB_LINK = 'https://echo-ai-blue.vercel.app'
export const ANDROID_LINK = 'https://github.com/frankenstein-denied/echo-Ai/releases/latest'
export const MAX_GUIDE_SLIDES = 10

export type InstallOption = { title: string; link: string; steps: string[]; pwa?: boolean }

export const INSTALL_OPTIONS: InstallOption[] = [
  {
    title: 'On a laptop or desktop',
    link: WEB_LINK,
    steps: ['Copy the link', 'Paste it into your browser and sign in'],
  },
  {
    title: 'Install as a web app (PWA)',
    link: WEB_LINK,
    pwa: true,
    steps: [
      'Copy the link and paste it into your browser',
      'iPhone or iPad (Safari): tap Share, then Add to Home Screen',
      'Android (Chrome): tap the ⋮ menu, then Add to Home screen',
      'Laptop or desktop (Chrome or Edge): click the install icon in the address bar',
    ],
  },
  {
    title: 'Install the Android app',
    link: ANDROID_LINK,
    steps: [
      'Copy the link',
      'Paste it into your browser',
      'Under Assets, tap echo.apk',
      'When the download finishes, open the file',
      'If Android asks, allow installs from your browser',
      'Tap Install, then open Echo',
    ],
  },
]

export const INSTALL_NOTE = 'To install, copy the link and paste it into a browser such as Chrome, Brave, Safari or Edge. Opening it inside Messenger or another chat app can fail.'

export type GuideSlide = {
  id: string
  title: string
  body: string
  points?: string[]
  /** Shown with a cross: what Echo is not for. */
  avoid?: string[]
  image?: string
  alt?: string
}

export const GUIDE_SLIDES: GuideSlide[] = [
  {
    id: 'welcome',
    title: 'Meet Echo',
    body: 'Your life, remembered. Echo is a companion and diary that helps you remember your days and stay on top of what matters to you.',
  },
  {
    id: 'purpose',
    title: 'Your diary, not a chatbot',
    body: 'Echo works best when you talk about your own life. It turns what you share into a record you can come back to.',
    points: ['Tell it about your day, plans and feelings', 'Say what you want to remember', 'Let it keep your goals, reminders and health'],
    avoid: ['Not a general AI for homework, essays or code'],
  },
  {
    id: 'diary',
    title: 'Diary',
    body: 'This is where you talk to Echo. Each conversation becomes a diary page.',
    points: ['Type, or tap the phone icon for a voice call', 'On a call, speak your own language and Echo replies in it', 'Echo saves notes, goals, reminders, health and meals from what you say'],
    image: '/guide/diary.webp',
    alt: 'The Diary page with a conversation about a morning run',
  },
  {
    id: 'notes',
    title: 'Notes',
    body: 'Everything you wrote or told Echo to remember, in one place.',
    points: ['Search and filter by category', 'Edit, delete or add a new note'],
    image: '/guide/notes.webp',
    alt: 'The Notes page with a list of saved notes',
  },
  {
    id: 'goals',
    title: 'Goals',
    body: 'Set what you want to achieve and watch your progress.',
    points: ['Break a goal into milestones and tick them off', 'Add goals here, or just tell Echo'],
    image: '/guide/goals.webp',
    alt: 'The Goals page with a 10K running goal and its milestones',
  },
  {
    id: 'reminders',
    title: 'Reminders',
    body: 'Things Echo will nudge you about, and routines it has learned.',
    points: ['Say "Remind me to..." in the Diary or add one here', 'Mark reminders done as you go'],
    image: '/guide/reminders.webp',
    alt: "The Reminders page with today's reminders and routines",
  },
  {
    id: 'health',
    title: 'Health',
    body: 'A simple picture of how you are doing today and across the week.',
    points: ['Mood, sleep, water and energy', 'Calories and meals, which you can turn off in Settings'],
    image: '/guide/health.webp',
    alt: 'The Health page with water, calories and mood',
  },
  {
    id: 'brain',
    title: '2nd Brain',
    body: 'Each diary page becomes a glowing memory orb, so you can see your life at a glance.',
    points: ['Tap Legend to see what the colors mean', 'Bigger orbs mean more happened', 'Threads link pages that share a person, interest or goal'],
    image: '/guide/brain.webp',
    alt: 'The 2nd Brain page with colorful memory orbs joined by threads',
  },
  {
    id: 'notification',
    title: 'Echo in your notification bar',
    body: 'On the Android app, go to More, then Settings, and turn on Pinned Echo notification.',
    points: ['See your reminders, goals and latest notes', 'Tap Done or +15m without opening the app', 'Talk starts a voice call over any app', 'Type opens a floating chathead with your diary'],
    image: '/guide/settings.webp',
    alt: 'The Settings page with the Pinned Echo notification switch turned on',
  },
  {
    id: 'install',
    title: 'Install Echo on any device',
    body: 'Pick what fits your device, or copy a link and send it to a friend.',
  },
]

export const INSTALL_SLIDE = GUIDE_SLIDES.length - 1
