# Cron Job Configuration for Dolphin House Booking System

## Auto-Expiry Cron Job

To automatically expire payment pending bookings, set up a cron job to run every 2-3 minutes:

### For Cloudflare Workers (Recommended)

Add this to your `wrangler.toml`:

```toml
[[triggers]]
crons = ["*/2 * * * *"]  # Run every 2 minutes
```

Then create a worker that calls your scheduled-expiry endpoint.

### For Traditional Cron

Add this to your crontab:

```bash
*/2 * * * * curl -X POST https://dolphinhouse-alibaug.com/api/scheduled-expiry
```

### For GitHub Actions (Alternative)

Create `.github/workflows/booking-expiry.yml`:

```yaml
name: Booking Expiry Check
on:
  schedule:
    - cron: '*/2 * * * *'  # Every 2 minutes
  workflow_dispatch:  # Allow manual triggering

jobs:
  check-expiry:
    runs-on: ubuntu-latest
    steps:
      - name: Check expired bookings
        run: |
          curl -X POST https://dolphinhouse-alibaug.com/api/scheduled-expiry \
            -H "Content-Type: application/json"
```

## Environment Variables Required

Make sure these are set in your environment:

- `MSG91_AUTH_KEY` - Your MSG91 authentication key
- `VILPOWER_SENDER_ID` - Your DLT sender ID (default: "DLHNOS")
- `VILPOWER_PEID` - Your DLT PEID
- `VILPOWER_TEMPLATE_ID_PAYMENT_PENDING` - Template for payment pending
- `VILPOWER_TEMPLATE_ID_PAYMENT_RECEIVED` - Template for payment confirmation
- `MSG91_EMAIL_FROM` - Email from address
- `MSG91_EMAIL_DOMAIN` - Email domain

## WhatsApp Templates

The system uses these MSG91 DLT templates:

### Payment Pending Template
- **Template ID**: `1107176123479912391`
- **Variables**: `name`, `checkin`, `rooms`, `advance`, `booking_id`

### Payment Received Template  
- **Template ID**: `1107176123495987139`
- **Variables**: `name`, `checkin`, `rooms`, `advance_paid`, `booking_id`

## Email Templates

The system uses MSG91 email templates:
- **Template ID**: `dh_booking_confirmation`
- **Domain**: `mail.dolphinhouse-alibaug.com`

## Testing

You can test the system manually:

```bash
# Test expiry check
curl -X POST https://dolphinhouse-alibaug.com/api/scheduled-expiry

# Check system health
curl https://dolphinhouse-alibaug.com/api/scheduled-expiry

# Test notifications (replace with actual booking ID)
curl -X POST https://dolphinhouse-alibaug.com/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": "your-booking-id",
    "type": "whatsapp",
    "trigger": "payment_confirmed"
  }'
```
