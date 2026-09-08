# Email

Concord sends three kinds of message: an invitation with a choose-a-password link, a notice to people who already had an account and were added to a campaign, and a password reset link. All three use Concord's own look with a plain-text alternative. Invitations carry a Reply-To of the person who invited.

Without SMTP settings nothing is sent and nothing breaks: invitation links are shown to the owner to pass on by hand, and reset links are written to the server log.

## Configuration

Everything is in `.env`:

```bash
APP_URL=https://concord.example.org       # used inside every link; https also marks cookies Secure
SMTP_HOST=smtp.example.org
SMTP_PORT=465                              # 465 = TLS from the first byte, 587 = STARTTLS
SMTP_SECURE=true                           # inferred from the port when unset
SMTP_USER=noreply@example.org              # the full mailbox address
SMTP_PASSWORD=...
MAIL_FROM=Concord <noreply@example.org>    # what recipients see; most providers require the address to match SMTP_USER
MAIL_REPLY_TO=you@example.org              # optional, for reset emails
LINK_TTL_HOURS=24                          # lifetime of invitation and reset links
```

After changing `.env`, restart (`docker compose up -d`) and check the settings without going through the app:

```bash
docker compose exec -u node app node cli.js mail test                    # log in and hang up
docker compose exec -u node app node cli.js mail test you@example.org    # send a real message
```

The usual reasons a provider refuses the login are a `SMTP_USER` that is not the full address, a wrong password, or a port and `SMTP_SECURE` pair that do not match.

### OVH mailboxes

For a mailbox on OVH's platform (MX Plan or Zimbra): `SMTP_HOST=smtp.mail.ovh.net`, port 465, `SMTP_SECURE=true`; `ssl0.ovh.net` also works. OVH only sends as a mailbox you own, so `MAIL_FROM` has to use the same address as `SMTP_USER`.

## Deliverability

Mail from a domain that has never sent before lands in spam until the domain is authenticated. Three DNS records, all at your DNS host:

- **SPF**: a TXT record on the domain listing your provider's servers, for instance `v=spf1 include:mx.ovh.com ~all` for OVH.
- **DKIM**: enable signing at your mail provider; it gives you CNAME or TXT records to add (OVH adds them itself when the DNS zone is at OVH: Web Cloud, Zimbra Mail or Emails, the domain, DKIM).
- **DMARC**: a TXT record on `_dmarc` such as `v=DMARC1; p=none; rua=mailto:you@example.org`, tightened to `p=quarantine` once everything passes.

Verify by sending a test to a Gmail address and opening *Show original*: SPF, DKIM and DMARC should all read PASS. A new sending address also has no reputation yet; that builds as real invitations are delivered and opened. Marking a first message "Not spam" helps your own inbox learn.

## Links and tokens

Invitation and reset tokens are 256-bit random values stored only as SHA-256 hashes. They work once and expire after `LINK_TTL_HOURS`. Resending an invitation issues a new token and kills the previous one. Changing a password invalidates every other session of the account.
