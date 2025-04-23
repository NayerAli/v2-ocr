Setting up Server-Side Auth for Next.js

Next.js comes in two flavors: the App Router and the Pages Router. You can set up Server-Side Auth with either strategy. You can even use both in the same application.


App Router

Pages Router

Hybrid router strategies
1
Install Supabase packages
Install the @supabase/supabase-js package and the helper @supabase/ssr package.

npm install @supabase/supabase-js @supabase/ssr
2
Set up environment variables
Create a .env.local file in your project root directory.

Fill in your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY:

Project URL
Medrive / Medrive
PROJECT PAUSED

Anon key
Medrive / Medrive
PROJECT PAUSED

NEXT_PUBLIC_SUPABASE_URL=<your_supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
3
Write utility functions to create Supabase clients
To access Supabase from your Next.js app, you need 4 types of Supabase clients:

getServerSideProps client - To access Supabase from getServerSideProps.
getStaticProps client - To access Supabase from getStaticProps.
Component client - To access Supabase from within components.
API route client - To access Supabase from API route handlers.
Create a utils/supabase folder with a file for each type of client. Then copy the utility functions for each client type.


Why do I need so many types of clients?

What does the `cookies` object do?

utils/supabase/server-props.ts

utils/supabase/static-props.ts

utils/supabase/component.ts

utils/supabase/api.ts
import { type GetServerSidePropsContext } from 'next'
import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
export function createClient({ req, res }: GetServerSidePropsContext) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.keys(req.cookies).map((name) => ({ name, value: req.cookies[name] || '' }))
        },
        setAll(cookiesToSet) {
          res.setHeader(
            'Set-Cookie',
            cookiesToSet.map(({ name, value, options }) =>
              serializeCookieHeader(name, value, options)
            )
          )
        },
      },
    }
  )
  return supabase
}
4
Create a login page
Create a login page for your app.

Since Supabase is being called from a component, use the client defined in @/utils/supabase/component.ts.


pages/login.tsx
import { useRouter } from 'next/router'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/component'
export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  async function logIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      console.error(error)
    }
    router.push('/')
  }
  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      console.error(error)
    }
    router.push('/')
  }
  return (
    <main>
      <form>
        <label htmlFor="email">Email:</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password:</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" onClick={logIn}>
          Log in
        </button>
        <button type="button" onClick={signUp}>
          Sign up
        </button>
      </form>
    </main>
  )
}
5
Change the Auth confirmation path
If you have email confirmation turned on (the default), a new user will receive an email confirmation after signing up.

Change the email template to support a server-side authentication flow.

Go to the Auth templates page in your dashboard. In the Confirm signup template, change {{ .ConfirmationURL }} to {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email.

6
Create a route handler for Auth confirmation
Create an API route for api/auth/confirm. When a user clicks their confirmation email link, exchange their secure code for an Auth token.

Since this is an API route, use the Supabase client from @/utils/supabase/api.ts.


pages/api/auth/confirm.ts

pages/error.tsx
import { type EmailOtpType } from '@supabase/supabase-js'
import type { NextApiRequest, NextApiResponse } from 'next'
import createClient from '@/utils/supabase/api'
function stringOrFirstString(item: string | string[] | undefined) {
  return Array.isArray(item) ? item[0] : item
}
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).appendHeader('Allow', 'GET').end()
    return
  }
  const queryParams = req.query
  const token_hash = stringOrFirstString(queryParams.token_hash)
  const type = stringOrFirstString(queryParams.type)
  let next = '/error'
  if (token_hash && type) {
    const supabase = createClient(req, res)
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash,
    })
    if (error) {
      console.error(error)
    } else {
      next = stringOrFirstString(queryParams.next) || '/'
    }
  }
  res.redirect(next)
}
7
Make an authenticated-only page using `getServerSideProps`
If you use dynamic server-side rendering, you can serve a page to authenticated users only by checking for the user data in getServerSideProps. Unauthenticated users will be redirected to the home page.

Since you're calling Supabase from getServerSideProps, use the client from @/utils/supabase/server-props.ts.

Be careful when protecting pages. The server gets the user session from the cookies, which can be spoofed by anyone.

Always use supabase.auth.getUser() to protect pages and user data.

Never trust supabase.auth.getSession() inside server code. It isn't guaranteed to revalidate the Auth token.

It's safe to trust getUser() because it sends a request to the Supabase Auth server every time to revalidate the Auth token.

import type { User } from '@supabase/supabase-js'
import type { GetServerSidePropsContext } from 'next'
import { createClient } from '@/utils/supabase/server-props'
export default function PrivatePage({ user }: { user: User }) {
  return <h1>Hello, {user.email || 'user'}!</h1>
}
export async function getServerSideProps(context: GetServerSidePropsContext) {
  const supabase = createClient(context)
  const { data, error } = await supabase.auth.getUser()
  if (error || !data) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    }
  }
  return {
    props: {
      user: data.user,
    },
  }
}
8
Fetch static data using `getStaticProps`
You can also fetch static data at build time using Supabase. Note that there's no session or user at build time, so the data will be the same for everyone who sees the page.

Add some colors data to your database by running the Colors Quickstart in the dashboard.

Then fetch the colors data using getStaticProps with the client from @/utils/supabase/static-props.ts.

import { createClient } from '@/utils/supabase/static-props'
export default function PublicPage({ data }: { data?: any[] }) {
  return <pre>{data && JSON.stringify(data, null, 2)}</pre>
}
export async function getStaticProps() {
  const supabase = createClient()
  const { data, error } = await supabase.from('colors').select()
  if (error || !data) {
    return { props: {} }
  }
  return { props: { data } }
}
Congratulations#
You're done! To recap, you've successfully:

Called Supabase from a component
Called Supabase from an API route
Called Supabase from getServerSideProps
Called Supabase from getStaticProps
You can now use any Supabase features from your client or server code!