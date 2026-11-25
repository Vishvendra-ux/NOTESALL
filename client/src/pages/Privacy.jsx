import { Link } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, UserCheck, Database, ArrowLeft } from 'lucide-react';

export default function Privacy() {
  const sections = [
    {
      icon: UserCheck,
      title: '1. Information We Collect',
      body: 'When you sign in to NOTESX using Google Sign-In or email registration, we collect your basic profile information (name, email address, and profile photo URL) along with optional academic details you provide during onboarding (college name, course, academic year, coding profile handles, and skills).',
    },
    {
      icon: Database,
      title: '2. How We Use Your Information',
      body: 'We use your account details solely to authenticate you on NOTESX, personalize your course notes, track your exam and coding progress, display community contributions you choose to publish, and manage your AI study quota.',
    },
    {
      icon: Lock,
      title: '3. Data Sharing & Google User Data',
      body: 'NOTESX does not sell, rent, or trade your personal information or Google account data to third parties. Google OAuth credentials are verified cryptographically for sign-in only and are never used to access private Google Workspace files, emails, or contacts.',
    },
    {
      icon: ShieldCheck,
      title: '4. Data Security & Account Deletion',
      body: 'Passwords are stored as salted cryptographic hashes, and sessions are protected over HTTPS. You may request export or permanent deletion of your NOTESX account and associated study records at any time by contacting support.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto py-6 sm:py-10 px-2">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400 hover:underline mb-6"
      >
        <ArrowLeft size={16} />
        <span>Back to NOTESX Home</span>
      </Link>

      <div className="bg-white/95 dark:bg-stone-900/95 border border-stone-200/90 dark:border-stone-800 rounded-3xl p-6 sm:p-10 shadow-sm space-y-8">
        <header className="border-b border-stone-200 dark:border-stone-800 pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs font-semibold mb-3">
            <ShieldCheck size={14} />
            <span>NOTESX Legal &amp; Trust</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-2">
            Effective Date: November 26, 2026
          </p>
        </header>

        <div className="space-y-6">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <section key={item.title} className="space-y-2">
                <h2 className="flex items-center gap-2.5 text-base sm:text-lg font-bold text-stone-900 dark:text-white">
                  <Icon size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{item.title}</span>
                </h2>
                <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  {item.body}
                </p>
              </section>
            );
          })}
        </div>

        <footer className="pt-6 border-t border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-stone-600 dark:text-stone-400">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Questions or deletion requests:{' '}
              <a
                href="mailto:pratapsinghvishvendra6@gmail.com"
                className="font-semibold text-amber-700 dark:text-amber-400 hover:underline"
              >
                pratapsinghvishvendra6@gmail.com
              </a>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
