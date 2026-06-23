import * as imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

export class GmailHelper {
  private config: any;

  constructor(email: string, appPassword: string) {
    this.config = {
      imap: {
        user: email,
        password: appPassword.replace(/\s+/g, ''),
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000,
      },
    };
  }

  async getLatestOTP(timeoutSeconds = 20, fromEmail?: string): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutSeconds * 1000) {
      try {
        const connection = await imaps.connect(this.config);
        await connection.openBox('INBOX');

        const oneMinuteAgo = new Date(Date.now() - 60000);
        const searchCriteria = [['SINCE', oneMinuteAgo]];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: true };

        const messages = await connection.search(searchCriteria, fetchOptions);

        if (messages.length > 0) {
          const latestMessage = messages[messages.length - 1];
          const all = latestMessage.parts.find((part: any) => part.which === '');

          if (all) {
            const parsed = await simpleParser(all.body);
            const emailBody = parsed.text || parsed.html || '';
            const emailSubject = parsed.subject || '';
            const emailDate = parsed.date;
            const emailFrom = parsed.from?.text || '';

            // თუ fromEmail მითითებულია, შევამოწმოთ გამომგზავნი
            if (fromEmail && !emailFrom.toLowerCase().includes(fromEmail.toLowerCase())) {
              await connection.end();
              await new Promise((resolve) => setTimeout(resolve, 2000));
              continue;
            }

            const emailAge = Date.now() - (emailDate ? emailDate.getTime() : 0);

            if (emailAge < 30000) {
              // BOG: "ეროვნული კოდი - 9295" (Subject-ში)
              let otpMatch = emailSubject.match(/ეროვნული კოდი\s*-\s*(\d{4,6})/i);

              // TBC: "SMS კოდი: 1234" (Body-ში)
              if (!otpMatch) otpMatch = emailBody.match(/SMS კოდი:\s*(\d{4,6})/i);

              // Fallback: ნებისმიერი 4-6 ციფრი
              if (!otpMatch) otpMatch = emailBody.match(/\b(\d{4,6})\b/);

              if (otpMatch) {
                await connection.end();
                return otpMatch[1];
              }
            }
          }
        }

        await connection.end();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        if (error.message.includes('Invalid credentials')) {
          throw new Error('Gmail auth failed');
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    throw new Error('OTP not found');
  }
}
