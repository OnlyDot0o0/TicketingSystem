// A minimal, production-oriented alternative to prisma/seed.ts: creates the
// one real project (رقابة+ / raqaba) with its actual current configuration
// and a single admin account — no demo/acme projects, no fake sample
// tickets, no extra test accounts. Run this instead of `npm run prisma:seed`
// when handing the app to someone who needs the real project ready to go
// without the local-dev demo clutter (see "Running locally" in README.md).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_CATEGORIES } from "../src/lib/categories";

const prisma = new PrismaClient();

const RAQABA_FAQ_URL = "https://claude.ai/code/artifact/6493aab5-1e9b-42a7-8651-ca98411419be";

async function main() {
  const adminEmail = "admin@raqaba.local";
  const adminPassword = "ChangeMe123!";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "SUPER_ADMIN" },
    create: {
      name: "مدير النظام",
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "SUPER_ADMIN",
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

  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { projectId_key: { projectId: raqaba.id, key: c.key } },
      update: {},
      create: { projectId: raqaba.id, key: c.key, label: c.label, order: i },
    });
  }

  // Matches the "رقم الحساب" (account number) field currently configured on
  // raqaba via the dashboard's ticket-form settings — required so every
  // submitted ticket carries an account number to look up against, same as
  // the live project's actual form.
  await prisma.customField.upsert({
    where: { projectId_key: { projectId: raqaba.id, key: "account-number" } },
    update: {},
    create: {
      projectId: raqaba.id,
      key: "account-number",
      label: "رقم الحساب",
      fieldType: "TEXT",
      required: true,
      order: 0,
    },
  });

  console.log("\n===============================================");
  console.log("تم إنشاء المشروع الأساسي بنجاح (بدون بيانات تجريبية)");
  console.log("-----------------------------------------------");
  console.log(`حساب المدير العام (SUPER_ADMIN): ${adminEmail}`);
  console.log(`كلمة المرور: ${adminPassword}`);
  console.log("!! يرجى تغيير كلمة المرور فور تسجيل الدخول لأول مرة !!");
  console.log("-----------------------------------------------");
  console.log("المشروع: /raqaba (رقابة+)");
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
