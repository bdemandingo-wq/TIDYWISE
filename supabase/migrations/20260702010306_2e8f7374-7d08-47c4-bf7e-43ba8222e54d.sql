SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_secret'),
  'Y-y_0t1hLkAas_zcN6XusuFllJTvbDCFNaf0addSH3a2m8PgjmnDFSGqW5Y-UGCi',
  'cron_secret'
);