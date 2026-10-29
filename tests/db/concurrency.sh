#!/usr/bin/env bash
# Concurrency checks for the credits ledger. Run ONLY against a disposable local database (it writes
# immutable ledger rows): npm run test:concurrency   (then `npm run db:reset` to clean up).
set -euo pipefail
DB=${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
SELLER=00000000-0000-4000-8000-000000000003   # tunde (demo seller with several active listings)
q() { psql "$DB" -Atq -v ON_ERROR_STOP=1 -c "$1"; }
as_seller="select set_config('request.jwt.claims', json_build_object('sub','$SELLER','role','authenticated')::text, false); set role authenticated;"
fail=0

echo "1) Parallel spends cannot overdraw"
bal=$(q "select coalesce((select balance from credit_accounts where user_id='$SELLER'),0)")
# top up so the balance is exactly 30 credits (enough for one 25-credit homepage promotion, not two)
need=$((30 - bal))
if [ "$need" -ne 0 ]; then q "select _apply_credits('$SELLER', $need, case when $need > 0 then 'admin_grant' else 'admin_debit' end::credit_tx_kind, 'conc-setup-' || gen_random_uuid(), 'test', null, 'concurrency test setup')" >/dev/null; fi
q "update promotion_campaigns set status='cancelled' where seller_id='$SELLER' and status in ('active','paused')" >/dev/null
mapfile -t LISTINGS < <(q "select id from listings where seller_id='$SELLER' and status='active' and moderation_status='approved' limit 4")
pids=()
for l in "${LISTINGS[@]}"; do
  ( psql "$DB" -Atq -c "$as_seller select create_promotion('$l', 'homepage', 1);" >/dev/null 2>&1 && echo ok || echo rejected ) > "/tmp/conc-$l" &
  pids+=($!)
done
wait "${pids[@]}"
ok=$(cat /tmp/conc-* | grep -c '^ok' || true); rm -f /tmp/conc-*
bal=$(q "select balance from credit_accounts where user_id='$SELLER'")
echo "   ${#LISTINGS[@]} parallel attempts, $ok succeeded, balance now $bal"
[ "$ok" -eq 1 ] && [ "$bal" -eq 5 ] || { echo "   FAIL"; fail=1; }

echo "2) Parallel duplicate webhooks grant once"
pkg=$(q "select id from credit_packages where country_code='NG' and name='Starter'")
ref=$(psql "$DB" -Atq -c "$as_seller select reference from start_checkout('credits', '$pkg');" | tail -1)
before=$(q "select balance from credit_accounts where user_id='$SELLER'")
pids=()
for i in 1 2 3 4 5 6; do
  psql "$DB" -Atq -c "select complete_payment('mock', '$ref', 250000, 'NGN', 'dup-$i');" > "/tmp/conc-pay-$i" &
  pids+=($!)
done
wait "${pids[@]}"
succeeded=$(cat /tmp/conc-pay-* | grep -c '^succeeded' || true); rm -f /tmp/conc-pay-*
after=$(q "select balance from credit_accounts where user_id='$SELLER'")
echo "   6 parallel completions, $succeeded reported succeeded, balance $before -> $after"
[ "$succeeded" -eq 1 ] && [ $((after - before)) -eq 50 ] || { echo "   FAIL"; fail=1; }

echo "3) Ledger reconciles"
mm=$(q "select count(*) from credit_ledger_mismatches()")
echo "   mismatched accounts: $mm"
[ "$mm" -eq 0 ] || { echo "   FAIL"; fail=1; }

q "update promotion_campaigns set status='cancelled' where seller_id='$SELLER' and status='active'" >/dev/null
[ $fail -eq 0 ] && echo "PASS" || { echo "FAILED"; exit 1; }
