/**
 * Miljö för testkörningen.
 *
 * Både globalSetup (som bygger databasen) och setupFiles (som kör testerna)
 * importerar den här filen. Skulle de sättas var för sig kan de hamna på olika
 * värden – och då seedas till exempel uppslagshashar med en annan peppar än den
 * appen använder, vilket gör att uppslagen tyst slutar matcha.
 */
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
// BankID körs som simulator i test. Simulatorn identifierar ingen och kan bara
// slås på utanför produktion.
process.env.BANKID_SIMULATOR = 'true';
