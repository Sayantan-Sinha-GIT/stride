import React from 'react';
import { normalizeLocale } from '@/i18n';

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = normalizeLocale(raw);
  const isHi = locale === 'hi';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <div className="stride-card flex flex-col gap-4 p-6 md:p-8">
        <h1 className="text-2xl font-bold">
          {isHi ? 'सेवा की शर्तें' : 'Terms of Service'}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--stride-text-secondary)]">
          {isHi
            ? 'Stride एक फिटनेस ट्रैकिंग और सामाजिक प्रतिस्पर्धा मंच है। कैलोरी और पेस के आंकड़े केवल अनुमान हैं—हम कोई चिकित्सकीय सलाह या स्वास्थ्य दावा नहीं करते।'
            : 'Stride provides GPS activity logging, deterministic track metrics, and community leaderboards. Calorie values are MET-based estimates only and do not constitute medical or health advice.'}
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--stride-text-secondary)]">
          <li>{isHi ? 'सड़क पर सुरक्षा व ट्रैफ़िक नियमों का पालन करना उपयोगकर्ता की जिम्मेदारी है।' : 'Always obey traffic laws and stay alert outdoors; never interact with your screen while moving in traffic.'}</li>
          <li>{isHi ? 'वाहन की गति वाले गलत GPS प्रयासों को निष्पक्षता जांच द्वारा फ़्लैग किया जाएगा।' : 'Segment efforts showing vehicle speeds or GPS manipulation may be flagged or hidden by moderators.'}</li>
        </ul>
      </div>
    </div>
  );
}
