import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Regex to match /agent<N>-login
    // e.g. /agent1-login
    const match = request.nextUrl.pathname.match(/^\/agent(\d+)-login$/);

    if (match) {
        const agentNum = match[1];
        // Rewrite to /agent-login?email=agent<N>@test<N>.com&password=password123
        const url = request.nextUrl.clone();
        url.pathname = '/agent-login';
        url.searchParams.set('email', `agent${agentNum}@test${agentNum}.com`);
        url.searchParams.set('password', 'password123');
        return NextResponse.rewrite(url);
    }
}

export const config = {
    matcher: '/:path*',
}
