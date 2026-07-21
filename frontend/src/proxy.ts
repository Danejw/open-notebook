import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Redirect root to projects
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  if (pathname === '/notebooks' || pathname.startsWith('/notebooks/')) {
    const suffix = pathname.slice('/notebooks'.length)
    return NextResponse.redirect(new URL(`/projects${suffix}`, request.url))
  }

  if (pathname === '/transformations' || pathname.startsWith('/transformations/')) {
    const suffix = pathname.slice('/transformations'.length)
    return NextResponse.redirect(new URL(`/artifact-templates${suffix}`, request.url))
  }

  if (pathname === '/artifacts' || pathname.startsWith('/artifacts/')) {
    const suffix = pathname.slice('/artifacts'.length)
    return NextResponse.redirect(new URL(`/artifact-templates${suffix}`, request.url))
  }

  if (
    pathname === '/opportunities/discovery' ||
    pathname.startsWith('/opportunities/discovery/')
  ) {
    return NextResponse.redirect(new URL('/opportunities', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
