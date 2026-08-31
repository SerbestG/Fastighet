process.env.NODE_ENV = 'test';
process.env.PGDATABASE ??= 'hemvist_test';
process.env.PGHOST ??= 'localhost';
process.env.PGADMINUSER ??= 'postgres';
process.env.PGADMINPASSWORD ??= 'postgres';
process.env.JOBS_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET ??= 'testnyckel-som-ar-minst-trettiotva-tecken-lang';
process.env.LOOKUP_PEPPER ??= 'testpeppar-som-ar-minst-trettiotva-tecken-lang';
process.env.STORAGE_ROOT ??= './var/test-storage';
// Hastighetsbegränsningen stängs av så att den inte slår mot testkörningen.
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
