export type DistributionBranch = 'florida' | 'konditerka' | 'bulvar';

interface BranchEnvConfig {
    cronSecret?: string;
    resendApiKey?: string;
    emailFrom?: string;
    emailTo?: string;
}

function getBranchEnvConfig(branch: DistributionBranch): BranchEnvConfig {
    if (branch === 'florida') {
        return {
            cronSecret: process.env.FLORIDA_CRON_SECRET || process.env.CRON_SECRET,
            resendApiKey: process.env.FLORIDA_RESEND_API_KEY || process.env.RESEND_API_KEY,
            emailFrom: process.env.FLORIDA_DISTRIBUTION_EMAIL_FROM,
            emailTo: process.env.FLORIDA_DISTRIBUTION_EMAIL_TO,
        };
    }

    if (branch === 'konditerka') {
        return {
            cronSecret: process.env.KONDITERKA_CRON_SECRET || process.env.CRON_SECRET,
            resendApiKey: process.env.KONDITERKA_RESEND_API_KEY || process.env.RESEND_API_KEY,
            emailFrom: process.env.KONDITERKA_DISTRIBUTION_EMAIL_FROM,
            emailTo: process.env.KONDITERKA_DISTRIBUTION_EMAIL_TO,
        };
    }

    return {
        cronSecret: process.env.BULVAR_CRON_SECRET || process.env.CRON_SECRET,
        resendApiKey: process.env.BULVAR_RESEND_API_KEY || process.env.RESEND_API_KEY,
        emailFrom: process.env.BULVAR_DISTRIBUTION_EMAIL_FROM,
        emailTo: process.env.BULVAR_DISTRIBUTION_EMAIL_TO,
    };
}

export function getDistributionCronSecret(branch: DistributionBranch): string {
    return getBranchEnvConfig(branch).cronSecret || '';
}

export function getDistributionEmailEnv(branch: DistributionBranch): Required<Pick<BranchEnvConfig, 'resendApiKey' | 'emailFrom' | 'emailTo'>> {
    const cfg = getBranchEnvConfig(branch);
    return {
        resendApiKey: cfg.resendApiKey || '',
        emailFrom: cfg.emailFrom || '',
        emailTo: cfg.emailTo || '',
    };
}

