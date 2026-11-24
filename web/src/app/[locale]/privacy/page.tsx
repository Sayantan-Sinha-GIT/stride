import React from 'react';
import { normalizeLocale } from '@/i18n';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = normalizeLocale(raw);
  const isHi = locale === 'hi';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <div className="stride-card flex flex-col gap-4 p-6 md:p-8">
        <h1 className="text-2xl font-bold">
          {isHi ? 'गोपनीयता नीति (DPDP अनुपालन)' : 'Privacy Policy & Location Data Notice'}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--stride-text-secondary)]">
          {isHi
            ? 'Stride आपकी गोपनीयता को प्राथमिकता देता है। हम केवल आपकी गतिविधि को रिकॉर्ड करने, दूरी व ऊंचाई मापने, और आपकी चुनी गई गोपनीयता सेटिंग के अनुसार शेयर करने के लिए आवश्यक डेटा एकत्र करते हैं।'
            : 'Stride collects only the data strictly needed to record, analyze, and share your athletic activities according to your explicit visibility settings (consistent with India’s Digital Personal Data Protection Act principles).'}
        </p>
        <h2 className="text-base font-bold">{isHi ? 'हम कौन सा लोकेशन डेटा लेते हैं और क्यों' : 'What Location Data We Collect & Why'}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--stride-text-secondary)]">
          <li>{isHi ? 'केवल आपके द्वारा गतिविधि रिकॉर्डिंग शुरू करने पर ही GPS बिंदु सहेजे जाते हैं।' : 'GPS coordinates are recorded solely while you actively run, ride, walk, or hike an activity session.'}</li>
          <li>{isHi ? 'नए खाते डिफ़ॉल्ट रूप से केवल फॉलोअर्स (Followers-Only) दृश्यता पर सेट होते हैं।' : 'New accounts default to Followers-Only visibility for every uploaded activity.'}</li>
          <li>{isHi ? 'प्राइवेसी ज़ोन (घर/ऑफिस) और शुरुआती/अंतिम दूरी सर्वर पर ही छुपाई जाती है।' : 'Privacy Zones and optional start/end masking strip sensitive coordinates server-side before any non-owner view, GPX download, or heatmap aggregation.'}</li>
          <li>{isHi ? 'हम आपका डेटा कभी बेचते या तीसरे पक्ष के विज्ञापनदाताओं को नहीं देते।' : 'We never sell, rent, or share personal or location data with advertisers.'}</li>
        </ul>
        <h2 className="text-base font-bold">{isHi ? 'डेटा एक्सपोर्ट और खाता हटाना' : 'Your Rights: Export & Deletion'}</h2>
        <p className="text-sm leading-relaxed text-[var(--stride-text-secondary)]">
          {isHi
            ? 'आप सेटिंग्स से कभी भी अपनी सभी गतिविधियाँ GPX/JSON में डाउनलोड कर सकते हैं या अपना खाता व सभी गतिविधियाँ स्थायी रूप से हटा सकते हैं।'
            : 'You can export all activities as GPX 1.1 and JSON anytime from Settings, or permanently delete your account and cascading activity data immediately.'}
        </p>
      </div>
    </div>
  );
}
