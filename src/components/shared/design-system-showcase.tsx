"use client";

import { useState, type ReactNode } from "react";
import {
  LayersIcon,
  PlusIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  LoadingSkeleton,
  PageHeader,
  SearchField,
  StatCard,
  StatusIndicator,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type DemoRow = {
  role: string;
  department: string;
  status: string;
  match: string;
};

const demoColumns = [
  { id: "role", header: "Role", accessorKey: "role", sortable: true },
  { id: "department", header: "Department", accessorKey: "department" },
  {
    id: "status",
    header: "Status",
    accessorKey: "status",
    cell: (row: DemoRow) => (
      <Badge variant={row.status === "Active" ? "success" : "secondary"}>
        {row.status}
      </Badge>
    ),
  },
  { id: "match", header: "Skill Match", accessorKey: "match" },
];

const demoRows: DemoRow[] = [
  {
    role: "Solutions Architect",
    department: "IT",
    status: "Active",
    match: "75%",
  },
  {
    role: "HR Specialist",
    department: "Human Resources",
    status: "Draft",
    match: "100%",
  },
  {
    role: "Finance Analyst",
    department: "Finance",
    status: "Active",
    match: "82%",
  },
  {
    role: "Operations Lead",
    department: "Ops",
    status: "Active",
    match: "68%",
  },
  {
    role: "Legal Counsel",
    department: "Legal",
    status: "Draft",
    match: "91%",
  },
  {
    role: "Product Manager",
    department: "Product",
    status: "Active",
    match: "88%",
  },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-navy">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="rounded-xl border border-border-slate bg-white p-6 shadow-card">
        {children}
      </div>
    </section>
  );
}

const navItems = [
  ["tokens", "Tokens"],
  ["typography", "Typography"],
  ["buttons", "Buttons"],
  ["forms", "Forms"],
  ["badges", "Badges & Status"],
  ["cards", "Cards"],
  ["overlays", "Overlays"],
  ["navigation", "Navigation"],
  ["data", "Data Display"],
  ["feedback", "Feedback"],
] as const;

export function DesignSystemShowcase() {
  const [department, setDepartment] = useState("it");

  return (
    <div className="min-h-screen bg-bg-slate">
      <header className="sticky top-0 z-40 border-b border-border-slate bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded bg-navy">
              <LayersIcon className="size-4 text-green-lime" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-navy">
                BICMAS Design System
              </p>
              <p className="text-[10px] font-medium tracking-widest text-muted-slate uppercase">
                BCMS
              </p>
            </div>
          </div>
          <StatusIndicator label="All systems operational" />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1">
            <p className="text-eyebrow mb-3 ml-3">Components</p>
            {navItems.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="block rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-active-bg hover:text-navy"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-10 pb-20">
          <PageHeader
            title="Enterprise design system"
            description="Tokens and components preserved from the BCMS HTML reference. Use these primitives for all future screens — do not invent parallel styles."
            breadcrumbs={
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/">Home</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Design System</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            }
            actions={
              <Button
                variant="secondary"
                onClick={() => toast.success("Design tokens synced")}
              >
                Toast demo
              </Button>
            }
          />

          <Section
            id="tokens"
            title="Colour tokens"
            description="Primary navy, lime accent, canvas, borders, and semantic status colours from DESIGN_SYSTEM.md."
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {[
                ["navy", "bg-navy"],
                ["navy-deep", "bg-navy-deep"],
                ["green-lime", "bg-green-lime"],
                ["green-deep", "bg-green-deep"],
                ["bg-slate", "bg-bg-slate border border-border-slate"],
                ["border-slate", "bg-border-slate"],
                ["success-soft", "bg-success-soft"],
                ["warning-soft", "bg-warning-soft"],
                ["error-soft", "bg-error-soft"],
                ["info-soft", "bg-info-soft"],
                ["active-bg", "bg-active-bg"],
                ["surface", "bg-surface border border-border-slate"],
              ].map(([name, swatch]) => (
                <div key={name} className="space-y-2">
                  <div className={`h-14 rounded-lg ${swatch}`} />
                  <p className="text-xs font-semibold text-navy">{name}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section
            id="typography"
            title="Typography"
            description="Inter weights 300–700. Page titles, eyebrows, breadcrumbs, and body copy."
          >
            <div className="space-y-4">
              <p className="text-eyebrow">Section eyebrow</p>
              <h1 className="text-3xl font-bold tracking-tight text-navy">
                Page title — Establish Role Requirements
              </h1>
              <h2 className="text-xl font-bold text-navy">Section title</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
                Supporting body copy uses slate-500 with relaxed leading, matching
                HTML page descriptions.
              </p>
              <p className="text-breadcrumb">Organization / Capability / Roles</p>
              <p className="text-3xl font-bold text-navy">1,284</p>
            </div>
          </Section>

          <Section
            id="buttons"
            title="Buttons"
            description="Primary navy, secondary outline, lime accent, ghost icon, and destructive soft fills."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button>
                <PlusIcon data-icon="inline-start" />
                Create New Role
              </Button>
              <Button variant="secondary">
                <UploadIcon data-icon="inline-start" />
                Bulk Import
              </Button>
              <Button variant="accent">Accent action</Button>
              <Button variant="ghost" size="icon" aria-label="More">
                <LayersIcon />
              </Button>
              <Button variant="destructive">Remove mapping</Button>
              <Button variant="link">Forgot?</Button>
            </div>
          </Section>

          <Section
            id="forms"
            title="Form controls"
            description="Inputs, selects, textareas, checkboxes, radios, and switches with BCMS field labels."
          >
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Work Email" htmlFor="email">
                <Input id="email" type="email" placeholder="name@company.com" />
              </Field>
              <Field label="Department" htmlFor="department">
                <Select
                  value={department}
                  onValueChange={(value) => {
                    if (value != null) setDepartment(String(value));
                  }}
                >
                  <SelectTrigger id="department" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it">IT</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Evidence & Comments"
                htmlFor="notes"
                className="md:col-span-2"
              >
                <Textarea
                  id="notes"
                  placeholder="Describe observable behaviours…"
                />
              </Field>
              <div className="flex items-center gap-2">
                <Checkbox id="remember" />
                <Label htmlFor="remember" className="text-sm font-medium normal-case tracking-normal text-slate-600">
                  Keep me signed in
                </Label>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border-slate bg-slate-50 px-4 py-3">
                <Label htmlFor="mfa" className="text-sm font-medium normal-case tracking-normal text-navy">
                  Multi-factor authentication
                </Label>
                <Switch id="mfa" defaultChecked />
              </div>
              <div className="md:col-span-2">
                <p className="text-field-label mb-3">Proficiency level</p>
                <RadioGroup defaultValue="3" className="grid gap-3 md:grid-cols-3">
                  {["2", "3", "4"].map((level) => (
                    <label
                      key={level}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-slate bg-slate-50 px-4 py-3"
                    >
                      <RadioGroupItem value={level} />
                      <span className="text-sm font-semibold text-navy">
                        Level {level}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </Section>

          <Section
            id="badges"
            title="Badges & status indicators"
            description="Uppercase micro chips and operational pulse dots."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Draft</Badge>
              <Badge variant="success">Active</Badge>
              <Badge variant="warning">High</Badge>
              <Badge variant="error">Critical</Badge>
              <Badge variant="info">Review</Badge>
              <Badge variant="accent">Aligned</Badge>
              <Badge variant="outline">Published</Badge>
            </div>
            <Separator className="my-6" />
            <div className="flex flex-wrap gap-6">
              <StatusIndicator label="All systems operational" />
              <StatusIndicator tone="warning" label="Attention required" />
              <StatusIndicator tone="error" label="Service degraded" pulse={false} />
              <StatusIndicator tone="info" label="Sync in progress" pulse={false} />
            </div>
          </Section>

          <Section
            id="cards"
            title="Cards & KPI tiles"
            description="White rounded-xl surfaces with border-slate and shadow-card."
          >
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Active Roles"
                value="1,284"
                delta="+8.2%"
                icon={LayersIcon}
              />
              <StatCard
                label="Avg Skill Gap"
                value="24.5%"
                delta="Reduced by 4%"
                deltaTone="warning"
                icon={TriangleAlertIcon}
                iconWellClassName="bg-amber-50 text-amber-600"
              />
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Capability summary</CardTitle>
                  <CardDescription>
                    Standard content card with header, body, and footer actions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-500">
                    Use Card primitives for list panels, settings blocks, and
                    detail sections across portals.
                  </p>
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  <Button variant="secondary" size="sm">
                    Cancel
                  </Button>
                  <Button size="sm">Save</Button>
                </CardFooter>
              </Card>
            </div>
          </Section>

          <Section
            id="overlays"
            title="Dialogs, menus & tooltips"
            description="Navy/40 backdrop with blur; menus and tooltips for chrome actions."
          >
            <div className="flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger render={<Button />}>Open dialog</DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Framework settings</DialogTitle>
                    <DialogDescription>
                      Confirm changes to the global proficiency scale.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="-mx-6 -mb-6">
                    <DialogClose render={<Button variant="secondary" />}>
                      Cancel
                    </DialogClose>
                    <DialogClose render={<Button />}>Save changes</DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <ConfirmDialog
                triggerLabel="Delete exception"
                title="Delete mapping exception?"
                description="This removes the exception from the queue. This action cannot be undone."
                confirmLabel="Delete"
                tone="destructive"
                onConfirm={() => toast.error("Exception deleted (demo)")}
              />

              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="secondary" />}>
                  User menu
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-48">
                  <DropdownMenuLabel>Sarah Jenkins</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                  <DropdownMenuItem>Settings</DropdownMenuItem>
                  <DropdownMenuItem>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon" />}>
                  <LayersIcon />
                </TooltipTrigger>
                <TooltipContent>Capability modules</TooltipContent>
              </Tooltip>
            </div>
          </Section>

          <Section
            id="navigation"
            title="Tabs, breadcrumbs & pagination"
            description="In-page navigation patterns used across admin and learner flows."
          >
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="mt-4 text-slate-500">
                Overview panel content.
              </TabsContent>
              <TabsContent value="evidence" className="mt-4 text-slate-500">
                Evidence queue content.
              </TabsContent>
              <TabsContent value="history" className="mt-4 text-slate-500">
                Audit history content.
              </TabsContent>
            </Tabs>
            <Separator className="my-6" />
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive>
                    1
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">2</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext href="#" />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </Section>

          <Section
            id="data"
            title="Search, filters & data tables"
            description="List-page toolbar and TanStack Table with BCMS table chrome."
          >
            <FilterBar
              className="mb-6"
              search={<SearchField showShortcut placeholder="Search roles…" />}
              filters={
                <>
                  <Select defaultValue="all">
                    <SelectTrigger className="w-[160px]" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      <SelectItem value="it">IT</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              }
              actions={
                <Button size="sm">
                  <PlusIcon data-icon="inline-start" />
                  Create
                </Button>
              }
            />
            <DataTable
              columns={demoColumns}
              data={demoRows}
              getRowId={(row) => row.role}
              pageIndex={0}
              pageCount={1}
            />
          </Section>

          <Section
            id="feedback"
            title="Empty states & loading skeletons"
            description="Placeholder and loading patterns for list and dashboard regions."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <EmptyState
                title="Start by importing your roles"
                description="Define organisational standards by establishing role-specific competencies to power AI-assisted mapping."
                action={<Button>Create New Role</Button>}
              />
              <div className="space-y-6">
                <LoadingSkeleton rows={4} />
                <LoadingSkeleton variant="table" rows={3} />
                <div className="flex gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
