import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft } from 'lucide-react'
import { CopyButton } from './copy-button'
import { GenerateInviteForm } from './generate-form'

export default async function AdminInvitePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (member?.role !== 'admin') redirect('/dashboard')

  const { data: codes } = await supabase
    .from('invite_codes')
    .select('*, created_by_member:created_by(name), used_by_member:used_by(name)')
    .order('created_at', { ascending: false })
    .limit(50)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/admin">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Admin
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold">Invite Codes</h1>

      {/* Generate new code */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Generate New Invite Code</CardTitle>
          <CardDescription>
            Each code can only be used once. Give an email address and we&apos;ll send the signup
            link straight there, or leave it blank and share the link yourself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateInviteForm />
        </CardContent>
      </Card>

      {/* Code list */}
      {codes && codes.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Emailed To</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Used By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((code) => {
              const isExpired =
                code.expires_at && new Date(code.expires_at) < new Date()
              const isUsed = !!code.used_at
              const signupUrl = `${appUrl}/signup?code=${code.code}`

              return (
                <TableRow key={code.id}>
                  <TableCell>
                    <span className="font-mono font-semibold tracking-widest">{code.code}</span>
                  </TableCell>
                  <TableCell>
                    {isUsed ? (
                      <Badge variant="secondary">Used</Badge>
                    ) : isExpired ? (
                      <Badge variant="destructive">Expired</Badge>
                    ) : (
                      <Badge className="bg-green-500/10 text-green-700 hover:bg-green-500/20">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {code.sent_to ? (
                      <div className="min-w-0">
                        <p className="truncate text-muted-foreground">{code.sent_to}</p>
                        {!code.sent_at && (
                          <Badge variant="outline" className="mt-0.5 text-[10px] text-amber-700">
                            Not delivered
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Link shared manually</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {code.expires_at
                      ? new Date(code.expires_at).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(code as any).used_by_member?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isUsed && !isExpired && (
                      <CopyButton text={signupUrl} />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="text-center text-muted-foreground py-8">
          No invite codes yet. Generate one above.
        </p>
      )}
    </div>
  )
}
