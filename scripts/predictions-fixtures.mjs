// Development-only Predictions fixtures for `QCC_PREDICTIONS=on npm run dev:online`. Never run against production.
// Every market inserted here has fixture=true; the API lists fixtures only while predictions_config.show_fixtures is
// true (never in production), and the interface labels each one "Development fixture". Questions are hypothetical
// templates from the reference pack, not claims that any event is scheduled.
import {createHash,randomUUID} from 'node:crypto';
const DAY=86_400_000;
const FIXTURES=[
 ['school','school','Will the athletics day start outdoors on its scheduled date?','The organiser\'s official notice confirms the outdoor programme started on the scheduled date.','The organiser\'s notice confirms the wet-weather plan or a postponement.','Cancellation, conflicting notices or no qualifying notice by 09:00 on the day.','Organiser\'s official event notice',2,3],
 ['school','public','Will the inter-house quiz be won by a house that has not won it before?','The official published result names a first-time winning house.','The official published result names a previous winner.','The quiz is cancelled or no official result is published within 7 days.','Official house results page',4,5],
 ['local','public','Will official rainfall at the Blenheim station reach 5 mm on Saturday?','The provider\'s daily total for the named station is 5.0 mm or more.','The provider\'s daily total for the named station is below 5.0 mm.','No daily total is published for the station within 3 days.','The MetService daily climate data for the Blenheim station',1,3],
 ['sport','public','Will the home side win this weekend\'s Super Rugby fixture?','The organiser\'s final result lists a home-side win after full time.','The final result lists a draw or an away win.','The match is abandoned and not completed within 7 days.','https://www.example.org/super-rugby/match-centre',3,4],
 ['games','public','Will the announced game update reach general release by the end of the month?','The publisher\'s official release notes show general (non-beta) availability by 23:59 on the last day.','No general-release notes by the deadline; beta builds do not count.','The update is cancelled outright before the deadline.','https://www.example.org/game/release-notes',6,8],
 ['technology','public','Will the named phone maker announce a foldable model before the end of next month?','An official company announcement of a foldable phone is published before the deadline.','No such official announcement by the deadline; rumours and leaks do not count.','The company stops publishing announcements for the whole window.','https://www.example.org/phones/newsroom',9,10],
 ['science','public','Will the named launch provider launch its mission within the announced window?','The operator\'s status shows lift-off within the announced window.','The window closes without a lift-off.','The mission is cancelled before the window opens.','https://www.example.org/launch/status',5,7],
 ['culture','public','Will the film reach the announced box-office threshold in its opening weekend?','The named reporting source shows the threshold met for the stated territory and currency.','The named reporting source shows it was not met.','The reporting source publishes no opening-weekend figure within 7 days.','https://www.example.org/box-office/weekend',7,9],
 ['community','public','Will the public photo competition reach 200 eligible entries by its cutoff?','The organiser\'s published eligible-entry count is 200 or more.','The published count is below 200.','No count is published within 7 days of the cutoff.','https://www.example.org/photo-competition/entries',8,10],
 ['school','school','Will the school production add an extra public performance?','The organiser\'s ticketing or official announcement adds a public performance before closing night.','No extra public performance is announced before closing night.','The production is cancelled.','Organiser\'s official ticketing page',-1,1],
];
const iso=ms=>new Date(ms).toISOString().replace(/\.\d{3}Z$/,'.000Z');
export async function seedPredictions(pool){
 await pool.query(`UPDATE predictions_config SET enabled=true,show_fixtures=true,launch_at=COALESCE(launch_at,now()-interval '14 days')`);
 const existing=await pool.query('SELECT count(*)::int AS n FROM predictions_markets WHERE fixture');
 if(existing.rows[0].n===0){
  const now=Date.now();
  for(const [category,audience,question,yesRule,noRule,voidRule,source,closeDays,resolveDays] of FIXTURES){
   const id=randomUUID(),closeAt=iso(now+closeDays*DAY),resolveAt=iso(now+resolveDays*DAY);
   const rules=[['question',question],['category',category],['audience',audience],['yesRule',yesRule],['noRule',noRule],['voidRule',voidRule],['source',source],['sourceFallback',''],['disclosure',''],['closeAt',closeAt],['resolveAt',resolveAt]];
   const hash=createHash('sha256').update(JSON.stringify(rules)).digest('hex');
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    await client.query(`INSERT INTO predictions_markets(id,state,fixture,category,audience,question,yes_rule,no_rule,void_rule,source,close_at,resolve_at,liquidity_b,rules_hash,published_at)
     VALUES ($1,'open',true,$2,$3,$4,$5,$6,$7,$8,$9,$10,20000000,$11,now())`,[id,category,audience,question,yesRule,noRule,voidRule,source,closeAt,resolveAt,hash]);
    const journal=(await client.query(`INSERT INTO predictions_journal(kind,market_id,actor,reason) VALUES ('fund',$1,'fixtures','Development fixture reserve') RETURNING id`,[id])).rows[0].id;
    await client.query(`INSERT INTO predictions_postings(journal_id,line,book,owner,amount) VALUES ($1,1,'treasury',NULL,-14000000),($1,2,'reserve',$2,14000000)`,[journal,id]);
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
 }
 // Optional: QCC_PREDICTIONS_MODERATORS=name1,name2 grants local roles to accounts that already exist.
 for(const name of (process.env.QCC_PREDICTIONS_MODERATORS??'').split(',').map(s=>s.trim()).filter(Boolean)){
  await pool.query(`INSERT INTO predictions_roles(account_id,role,granted_by) SELECT id,'moderator','dev fixtures' FROM accounts WHERE lower(username)=lower($1) ON CONFLICT DO NOTHING`,[name]);
 }
}
