import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const RAQABA_FAQ_URL = "https://claude.ai/code/artifact/6493aab5-1e9b-42a7-8651-ca98411419be";

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 5 && day !== 6) remaining -= 1;
  }
  return result;
}

async function seedProjectTickets(
  project: { id: string; ticketPrefix: string },
  admin: { id: string; name: string },
  agent: { id: string; name: string },
  sampleTickets: Array<{
    subject: string;
    description: string;
    category: "LOGIN_CONNECTIVITY" | "ROUTES_PATROLS" | "RECORDS_DATES" | "PHOTOS_ATTACHMENTS" | "PERFORMANCE" | "OTHER";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    status: "NEW" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
    submitterName: string;
    submitterPhone: string;
    submitterEmail: string | null;
    contractNumber: string | null;
    assignedToId: string | null;
    daysAgo: number;
    resolved?: boolean;
  }>
) {
  for (const t of sampleTickets) {
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { ticketSeq: { increment: 1 } },
    });
    const ticketNumber = `${updated.ticketPrefix}-${String(updated.ticketSeq).padStart(6, "0")}`;

    const existing = await prisma.ticket.findUnique({ where: { ticketNumber } });
    if (existing) continue;

    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - t.daysAgo);
    const slaDueAt = addBusinessDays(
      createdAt,
      t.priority === "URGENT" ? 0 : t.priority === "HIGH" ? 1 : t.priority === "MEDIUM" ? 3 : 5
    );
    if (t.priority === "URGENT") slaDueAt.setHours(slaDueAt.getHours() + 4);

    const ticket = await prisma.ticket.create({
      data: {
        projectId: project.id,
        ticketNumber,
        subject: t.subject,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        submitterName: t.submitterName,
        submitterPhone: t.submitterPhone,
        submitterEmail: t.submitterEmail,
        contractNumber: t.contractNumber,
        assignedToId: t.assignedToId,
        slaDueAt,
        createdAt,
        resolvedAt: t.resolved ? new Date() : null,
      },
    });

    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: "SUBMITTER",
        authorName: t.submitterName,
        isInternalNote: false,
        body: t.description,
        createdAt,
      },
    });

    if (t.assignedToId) {
      await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: "AGENT",
          authorName: t.assignedToId === agent.id ? agent.name : admin.name,
          isInternalNote: true,
          body: "تم استلام التذكرة وسيتم المتابعة معها.",
        },
      });
    }
  }
}

async function main() {
  const adminEmail = "admin@raqaba.local";
  const adminPassword = "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // The original single-project seed created this account as ADMIN. It's
  // now promoted to SUPER_ADMIN so it can manage projects — per the
  // multi-project refactor spec, no separate super-admin account is added.
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "SUPER_ADMIN" },
    create: {
      name: "مدير النظام",
      email: adminEmail,
      passwordHash,
      role: "SUPER_ADMIN",
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@raqaba.local" },
    update: {},
    create: {
      name: "أحمد الدعم الفني",
      email: "agent@raqaba.local",
      passwordHash: await bcrypt.hash("Agent123!", 10),
      role: "AGENT",
    },
  });

  // v3 demonstration custom role: "وكيل أول" (Senior Agent) — base AGENT
  // plus canViewReports + canManageCannedResponses only (canManageTeam and
  // canManageTicketForm stay OFF, unlike full ADMIN). See README for the
  // full custom-role model.
  const seniorAgentRole = await prisma.customRole.upsert({
    where: { name: "وكيل أول" },
    update: {
      baseRole: "AGENT",
      canManageTeam: false,
      canManageTicketForm: false,
      canViewReports: true,
      canManageCannedResponses: true,
    },
    create: {
      name: "وكيل أول",
      baseRole: "AGENT",
      canManageTeam: false,
      canManageTicketForm: false,
      canViewReports: true,
      canManageCannedResponses: true,
    },
  });

  // Demonstration account assigned this custom role — membership on `demo`
  // only, so it exercises both the custom-role permission gates AND
  // project scoping at once.
  const seniorAgentPassword = "SeniorAgent123!";
  const seniorAgent = await prisma.user.upsert({
    where: { email: "senioragent@raqaba.local" },
    update: { role: "CUSTOM", customRoleId: seniorAgentRole.id, passwordHash: await bcrypt.hash(seniorAgentPassword, 10) },
    create: {
      name: "ليلى الوكيل الأول",
      email: "senioragent@raqaba.local",
      passwordHash: await bcrypt.hash(seniorAgentPassword, 10),
      role: "CUSTOM",
      customRoleId: seniorAgentRole.id,
    },
  });

  const raqaba = await prisma.project.upsert({
    where: { slug: "raqaba" },
    update: {},
    create: {
      slug: "raqaba",
      name: "رقابة+",
      accentColorHex: "#b5691a",
      faqUrl: RAQABA_FAQ_URL,
      ticketPrefix: "RQ",
      ticketSeq: 0,
    },
  });

  const demo = await prisma.project.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "مشروع تجريبي",
      accentColorHex: "#3b5bdb",
      faqUrl: null,
      ticketPrefix: "DEMO",
      ticketSeq: 0,
    },
  });

  // Third seeded project — exists specifically so the project-scoping demo
  // (testadmin@raqaba.local, ADMIN with membership on `demo` only) has a
  // project it must NOT be able to see.
  const acme = await prisma.project.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      slug: "acme",
      name: "مشروع اختبار ثالث",
      accentColorHex: "#8a2be2",
      faqUrl: null,
      ticketPrefix: "ACME",
      ticketSeq: 0,
    },
  });

  // Leftover demonstration ADMIN account from prior verification rounds —
  // repurposed here as the project-scoping demo account: membership on
  // `demo` ONLY, so logging in as this account should show demo's tickets
  // /reports/team and 403/404 on anything raqaba- or acme-scoped.
  const testAdminPassword = "TestAdmin123!";
  const testAdmin = await prisma.user.upsert({
    where: { email: "testadmin@raqaba.local" },
    update: { role: "ADMIN", passwordHash: await bcrypt.hash(testAdminPassword, 10) },
    create: {
      name: "مدير اختبار",
      email: "testadmin@raqaba.local",
      passwordHash: await bcrypt.hash(testAdminPassword, 10),
      role: "ADMIN",
    },
  });

  // Project memberships. admin@raqaba.local is SUPER_ADMIN and bypasses
  // membership entirely. agent@raqaba.local already has ticket assignments
  // in BOTH raqaba and demo (seeded below), so it needs membership in both
  // to keep those assignments visible/valid under the new scoping model.
  await prisma.projectMembership.upsert({
    where: { userId_projectId: { userId: agent.id, projectId: raqaba.id } },
    update: {},
    create: { userId: agent.id, projectId: raqaba.id },
  });
  await prisma.projectMembership.upsert({
    where: { userId_projectId: { userId: agent.id, projectId: demo.id } },
    update: {},
    create: { userId: agent.id, projectId: demo.id },
  });
  await prisma.projectMembership.upsert({
    where: { userId_projectId: { userId: testAdmin.id, projectId: demo.id } },
    update: {},
    create: { userId: testAdmin.id, projectId: demo.id },
  });
  await prisma.projectMembership.upsert({
    where: { userId_projectId: { userId: seniorAgent.id, projectId: demo.id } },
    update: {},
    create: { userId: seniorAgent.id, projectId: demo.id },
  });

  // v3 demonstration custom fields — one per project, so the public form
  // scoping (each project only shows its own fields) is verifiable
  // out-of-the-box. `raqaba` gets a REQUIRED SELECT field (exercises
  // server-side enforcement of a required custom field); `demo` gets an
  // OPTIONAL TEXT field.
  await prisma.customField.upsert({
    where: { projectId_key: { projectId: raqaba.id, key: "asset-type" } },
    update: {},
    create: {
      projectId: raqaba.id,
      key: "asset-type",
      label: "نوع الأصل",
      fieldType: "SELECT",
      required: true,
      options: JSON.stringify(["مركبة", "معدات", "مبنى", "أخرى"]),
      order: 0,
    },
  });
  await prisma.customField.upsert({
    where: { projectId_key: { projectId: demo.id, key: "reference-note" } },
    update: {},
    create: {
      projectId: demo.id,
      key: "reference-note",
      label: "ملاحظة مرجعية",
      fieldType: "TEXT",
      required: false,
      order: 0,
    },
  });

  await seedProjectTickets(raqaba, admin, agent, [
    {
      subject: "لا أستطيع تسجيل الدخول للتطبيق",
      description: "أحاول تسجيل الدخول برقم الهوية وكلمة المرور المعتادة ويظهر لي خطأ في الاتصال بالخادم.",
      category: "LOGIN_CONNECTIVITY",
      priority: "URGENT",
      status: "NEW",
      submitterName: "خالد المطيري",
      submitterPhone: "0501234567",
      submitterEmail: "khaled.m@example.com",
      contractNumber: "CT-1042",
      assignedToId: null,
      daysAgo: 0,
    },
    {
      subject: "المسار اليومي لا يظهر في الجدول",
      description: "مسار الدورية الخاص بموقع محطة الطاقة لا يظهر لي منذ يومين رغم أنه كان يعمل بشكل طبيعي.",
      category: "ROUTES_PATROLS",
      priority: "HIGH",
      status: "OPEN",
      submitterName: "سارة العتيبي",
      submitterPhone: "0559876543",
      submitterEmail: null,
      contractNumber: "CT-2087",
      assignedToId: agent.id,
      daysAgo: 2,
    },
    {
      subject: "خطأ في تاريخ آخر تفتيش مسجل",
      description: "السجل يظهر تاريخ التفتيش الأخير بشكل خاطئ (سنة 2019 بدلاً من 2026) لأحد المعدات.",
      category: "RECORDS_DATES",
      priority: "MEDIUM",
      status: "PENDING",
      submitterName: "محمد فتحي",
      submitterPhone: "01001234567",
      submitterEmail: "m.fathy@example.com",
      contractNumber: null,
      assignedToId: agent.id,
      daysAgo: 4,
    },
    {
      subject: "لا يمكن رفع صور المعاينة",
      description: "عند محاولة إرفاق صور من الكاميرا يتوقف التطبيق فجأة قبل اكتمال الرفع.",
      category: "PHOTOS_ATTACHMENTS",
      priority: "HIGH",
      status: "RESOLVED",
      submitterName: "علي حسن",
      submitterPhone: "0567891234",
      submitterEmail: "ali.hassan@example.com",
      contractNumber: "CT-1155",
      assignedToId: admin.id,
      daysAgo: 6,
      resolved: true,
    },
    {
      subject: "التطبيق بطيء جدًا عند فتح القوائم",
      description: "فتح قائمة أوامر العمل يستغرق أكثر من دقيقة أحيانًا، خاصة في المواقع ذات الاتصال الضعيف.",
      category: "PERFORMANCE",
      priority: "LOW",
      status: "CLOSED",
      submitterName: "فهد الشمري",
      submitterPhone: "0512345678",
      submitterEmail: null,
      contractNumber: null,
      assignedToId: agent.id,
      daysAgo: 10,
      resolved: true,
    },
    {
      subject: "استفسار عام حول تحديث التطبيق الجديد",
      description: "هل التحديث الجديد يتطلب إعادة تسجيل بيانات العقد؟",
      category: "OTHER",
      priority: "LOW",
      status: "NEW",
      submitterName: "ياسر عبدالله",
      submitterPhone: "01112223334",
      submitterEmail: null,
      contractNumber: "CT-3300",
      assignedToId: null,
      daysAgo: 1,
    },
  ]);

  await seedProjectTickets(demo, admin, agent, [
    {
      subject: "طلب إضافة مستخدم جديد للنظام التجريبي",
      description: "نحتاج إضافة مستخدم جديد بصلاحيات مشاهدة فقط لفريق التدريب.",
      category: "OTHER",
      priority: "MEDIUM",
      status: "NEW",
      submitterName: "منى الحربي",
      submitterPhone: "0598765432",
      submitterEmail: "mona.h@example.com",
      contractNumber: null,
      assignedToId: null,
      daysAgo: 1,
    },
    {
      subject: "بطء في تحميل الصفحة الرئيسية",
      description: "الصفحة الرئيسية تستغرق وقتًا طويلاً للتحميل عند استخدام شبكة الجوال.",
      category: "PERFORMANCE",
      priority: "LOW",
      status: "OPEN",
      submitterName: "عمر السيد",
      submitterPhone: "01234567890",
      submitterEmail: null,
      contractNumber: null,
      assignedToId: agent.id,
      daysAgo: 3,
    },
  ]);

  console.log("\n===============================================");
  console.log("تم إنشاء بيانات أولية بنجاح");
  console.log("-----------------------------------------------");
  console.log(`حساب المدير العام (SUPER_ADMIN): ${adminEmail}`);
  console.log(`كلمة المرور: ${adminPassword}`);
  console.log("!! يرجى تغيير كلمة المرور فور تسجيل الدخول لأول مرة !!");
  console.log("-----------------------------------------------");
  console.log("حساب موظف دعم تجريبي (AGENT، عضو في raqaba و demo): agent@raqaba.local / Agent123!");
  console.log("-----------------------------------------------");
  console.log(`حساب دور مخصص تجريبي ("وكيل أول" — AGENT + عرض التقارير + إدارة الردود الجاهزة، عضو في demo فقط): senioragent@raqaba.local / ${seniorAgentPassword}`);
  console.log("-----------------------------------------------");
  console.log(`حساب مدير مشروع تجريبي (ADMIN، عضو في demo فقط): testadmin@raqaba.local / ${testAdminPassword}`);
  console.log("-----------------------------------------------");
  console.log("المشاريع: /raqaba (رقابة+)، /demo (مشروع تجريبي)، /acme (مشروع اختبار ثالث)");
  console.log("===============================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
