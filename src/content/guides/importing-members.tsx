import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import { FileSpreadsheet } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'importing-members',
  title: 'Importing members from a spreadsheet',
  summary: 'Load a whole directory at once, relationships included, without typing it twice.',
  section: 'directory',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        Most families already have their directory in a spreadsheet somewhere. This loads it in one
        go — people and the links between them — and shows you exactly what it will do before it
        does anything. Find it at <UI>Import from Spreadsheet</UI> on the directory or the manage
        members page.
      </P>

      <Steps>
        <Step n={1} title="Start from the template">
          <p>
            Press <UI>Download CSV Template</UI> and work from that rather than reshaping your own
            file by guesswork. The page lists every column and what it accepts.
          </p>
          <Screen label="Import — step 1">
            <Button variant="outline">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Download CSV Template
            </Button>
          </Screen>
          <p>The columns worth knowing about:</p>
          <List>
            <li>
              <UI>name</UI> and <UI>email</UI> are required. The email matters more than it looks
              — it is how a person later claims their own profile, so it should be the address
              they actually use.
            </li>
            <li>
              Dates accept either <UI>1975-06-14</UI> or <UI>6/14/1975</UI>.
            </li>
            <li>
              <UI>photo_url</UI> must start with <UI>https://</UI>.
            </li>
            <li>
              The four <UI>visibility_*</UI> columns take <UI>members</UI>, <UI>committee</UI> or{' '}
              <UI>none</UI>. This is currently the only way to set them.
            </li>
            <li>
              Relationships use <UI>external_id</UI> as a handle, referenced from{' '}
              <UI>parent_1</UI>, <UI>parent_2</UI>, <UI>parent_kind</UI>, <UI>spouse</UI> and{' '}
              <UI>spouse_status</UI>. An email address works as a reference too.
            </li>
          </List>
        </Step>

        <Step n={2} title="Upload the file">
          <p>
            Drag it onto the page or use <UI>Choose File</UI>. Both <UI>.xlsx</UI> and{' '}
            <UI>.csv</UI> work, and the format is detected from the contents rather than the
            extension — so a mislabelled file still works. The old <UI>.xls</UI> format does not;
            re-save it as <UI>.xlsx</UI> first.
          </p>
        </Step>

        <Step n={3} title="Read the preview before you commit">
          <p>
            Nothing is written yet. You get three counts — to be added, already in the directory,
            relationships — then any blocking errors, then warnings, then a row-by-row table
            marked <Badge variant="secondary">Add</Badge>, <Badge variant="outline">Skip</Badge> or{' '}
            <Badge variant="destructive">Error</Badge>.
          </p>
          <Screen label="Import — step 3, review">
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['To be added', '42'],
                  ['Already in directory', '7'],
                  ['Relationships', '31'],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{n}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border">
                {[
                  ['Rose Carter', 'rose@example.com', 'Add'],
                  ['Michael Carter', 'michael@example.com', 'Add'],
                  ['Jane Smith', 'jane@example.com', 'Skip'],
                ].map(([n, e, s]) => (
                  <div key={n} className="flex items-center justify-between border-b px-3 py-2 last:border-0">
                    <span className="text-sm">{n}</span>
                    <span className="text-xs text-muted-foreground">{e}</span>
                    <Badge variant={s === 'Add' ? 'secondary' : 'outline'} className="text-[10px]">
                      {s}
                    </Badge>
                  </div>
                ))}
              </div>
              <Button>Import 42 Members</Button>
            </div>
          </Screen>
          <p>
            The import button stays disabled while any error remains. Fix them in the spreadsheet
            and upload again — there is no way to import a half-broken file.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="tip" title="Duplicates are skipped, not doubled">
        <p>
          Anyone whose email already exists is marked <em>Already in directory</em> and left
          alone. Re-running the same file is safe, which means you can import, fix a few rows, and
          import again without creating a mess.
        </p>
      </GuideNote>

      <H2>What imported people look like afterwards</H2>
      <P>
        They appear with a <Badge variant="outline">Not joined</Badge> badge — real directory
        entries that nobody has signed into yet. When someone signs up using the same email
        address, they take over that profile rather than starting a new one. Everyone comes in as
        a plain member; roles are changed afterwards on the manage members page.
      </P>
      <P>
        Addresses aren&apos;t placed on the map at import time. That happens the first time the
        profile is saved.
      </P>
    </>
  )
}
