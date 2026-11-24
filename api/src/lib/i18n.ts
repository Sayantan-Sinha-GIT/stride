export type Lang = 'en' | 'hi';

export const API_MESSAGES = {
  en: {
    unauthorized: 'Authentication required.',
    forbidden: 'You do not have permission to access this resource.',
    notFound: 'Resource not found.',
    rateLimited: 'Too many requests. Please wait a moment and try again.',
    invalidCredentials: 'Invalid email or password.',
    emailUnverified: 'Please verify your email address before signing in.',
    signupAccepted: 'If this email is eligible, a verification code has been sent.',
    resetAccepted: 'If an account matches this email, a reset link and code have been sent.',
    emailDailyCapHit: 'Daily transactional email quota reached. Please try again later.',
    kudosTitle: 'New Kudos on Stride',
    kudosBody: (actor: string, count: number) =>
      count > 1 ? `${actor} and ${count - 1} others gave you kudos.` : `${actor} gave you kudos.`,
    commentTitle: 'New Comment',
    commentBody: (actor: string, preview: string) => `${actor}: "${preview}"`,
    followTitle: 'New Follower',
    followBody: (actor: string) => `${actor} started following you.`,
    followRequestTitle: 'Follow Request',
    followRequestBody: (actor: string) => `${actor} requested to follow you.`,
    prTitle: 'New Segment Personal Record!',
    prBody: (segName: string, secs: number) => `You set a new PR on ${segName} (${secs}s).`,
    badgeTitle: 'Badge Unlocked',
    badgeBody: (title: string) => `You earned the "${title}" badge!`,
  },
  hi: {
    unauthorized: 'कृपया आगे बढ़ने के लिए लॉग इन करें।',
    forbidden: 'आपके पास इस संसाधन को देखने की अनुमति नहीं है।',
    notFound: 'अनुरोधित डेटा नहीं मिला।',
    rateLimited: 'बहुत अधिक अनुरोध। कृपया थोड़ी देर बाद पुनः प्रयास करें।',
    invalidCredentials: 'ईमेल या पासवर्ड गलत है।',
    emailUnverified: 'लॉग इन करने से पहले कृपया अपना ईमेल सत्यापित करें।',
    signupAccepted: 'यदि यह ईमेल पात्र है, तो सत्यापन कोड भेज दिया गया है।',
    resetAccepted: 'यदि इस ईमेल से खाता जुड़ा है, तो रीसेट लिंक और कोड भेज दिया गया है।',
    emailDailyCapHit: 'दैनिक ईमेल सीमा पूरी हो गई है। कृपया बाद में प्रयास करें।',
    kudosTitle: 'Stride पर नई शाबाशी (Kudos)',
    kudosBody: (actor: string, count: number) =>
      count > 1 ? `${actor} और ${count - 1} अन्य लोगों ने आपको शाबाशी दी।` : `${actor} ने आपको शाबाशी दी।`,
    commentTitle: 'नई टिप्पणी',
    commentBody: (actor: string, preview: string) => `${actor}: "${preview}"`,
    followTitle: 'नया फॉलोअर',
    followBody: (actor: string) => `${actor} ने आपको फॉलो करना शुरू किया।`,
    followRequestTitle: 'फॉलो अनुरोध',
    followRequestBody: (actor: string) => `${actor} ने आपको फॉलो करने का अनुरोध भेजा है।`,
    prTitle: 'सेगमेंट में नया व्यक्तिगत रिकॉर्ड (PR)!',
    prBody: (segName: string, secs: number) => `आपने ${segName} पर नया PR बनाया (${secs} सेकंड)।`,
    badgeTitle: 'नया बैज अनलॉक हुआ',
    badgeBody: (title: string) => `आपने "${title}" बैज हासिल किया!`,
  },
} as const;

export function pickLang(val?: string | null): Lang {
  return val === 'hi' ? 'hi' : 'en';
}
