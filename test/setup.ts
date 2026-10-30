// The suite's expectations are written in English; tests about language pick their own.
process.env.DECS_LANG ||= 'en'
// Run as the lead even inside a teammate session, where the monitor would otherwise filter to that teammate.
process.env.DECS_TEAMMATE = ''
// A string printed with a placeholder left unfilled fails the test that printed it.
process.env.DECS_STRICT_I18N = '1'
