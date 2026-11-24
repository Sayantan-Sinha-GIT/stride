import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const hasLocale = pathname === '/en' || pathname.startsWith('/en/') || pathname === '/hi' || pathname.startsWith('/hi/');
  if (hasLocale) {
    return NextResponse.next();
  }

  // Detect preferred language from cookie or Accept-Language header (only EN or HI supported at launch)
  const cookieLang = request.cookies.get('stride_lang')?.value;
  const acceptLang = request.headers.get('accept-language') || '';
  const detected = cookieLang === 'hi' || (!cookieLang && acceptLang.toLowerCase().startsWith('hi')) ? 'hi' : 'en';

  const url = request.nextUrl.clone();
  url.pathname = `/${detected}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
