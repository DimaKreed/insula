process.loadEnvFile('.env.local');
import { neon } from '@neondatabase/serverless';
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  console.log('--- islands by owner ---');
  console.log(await sql`select u.email, count(i.id) as islands,
      count(*) filter (where i.archived_at is not null) as archived
    from users u left join islands i on i.user_id = u.id
    group by u.email order by u.email`);
  console.log('--- users ---');
  console.log(await sql`select id, email, name, email_verified, created_at from users order by created_at`);
  console.log('--- accounts (how each user signs in) ---');
  console.log(await sql`select a.provider, a.type, u.email from accounts a join users u on u.id = a.user_id`);
}
main();
