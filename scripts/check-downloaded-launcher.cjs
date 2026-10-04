const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const AdmZip=require('adm-zip');
const {_electron}=require('playwright');
if (!process.env.PACKPANEL_CHECK_DIR) throw new Error('Set PACKPANEL_CHECK_DIR to the directory returned by check-release.cjs');
const temporary=process.env.PACKPANEL_CHECK_DIR;
const session=JSON.parse(fs.readFileSync(path.join(temporary,'validation-session.json')));
const root=path.join(temporary,'packpanel-desktop-check');
const userData=path.join(root,'user-data');
new AdmZip(path.join(temporary,'downloaded-launcher.zip')).extractAllTo(root,true);
const gameDir=path.join(userData,'game','instances',session.instance.slug);
async function api(route,body) {
  const res=await fetch(session.base+'/api'+route,{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)throw new Error('API '+route+' HTTP '+res.status+' '+await res.text());
  return res.json();
}
let electron;
(async()=>{
  electron=await _electron.launch({executablePath:path.join(root,'windows','electron.exe'),args:['--user-data-dir='+userData],timeout:60000});
  const win=await electron.firstWindow();
  await win.waitForFunction(()=>document.getElementById('title').textContent==='Release Check Launcher');
  const errors=[];win.on('pageerror',error=>errors.push(error.message));
  assert.equal(await win.locator('select').count(),0);
  await win.locator('#language-en').click();
  assert.equal(await win.locator('#home-tab').innerText(),'Play');
  assert.equal(await win.locator('#window-close').getAttribute('aria-label'),'Close');
  await win.locator('#settings-tab').click();
  assert.equal(await win.locator('.page-heading h1').innerText(),'Settings');
  assert.equal(await win.locator('nav button.selected').count(),1);
  assert.equal(await win.locator('#settings-tab').getAttribute('aria-pressed'),'true');
  await win.locator('#language-fr').click();
  await win.screenshot({path:path.join(temporary,'packpanel-launcher-settings-fr.png')});
  await win.locator('#window-maximize').click();
  await win.waitForFunction(()=>document.getElementById('window-maximize').title==='Restaurer');
  await win.locator('#window-maximize').click();
  await win.waitForFunction(()=>document.getElementById('window-maximize').title==='Agrandir');
  await win.locator('#settings-tab').click();
  await win.locator('#ram').fill('2048');
  await win.locator('#jvm-args').fill('-Dpackpanel.releaseCheck=true -Dpackpanel.label="two words"');
  await win.locator('#save-settings').click();
  await win.waitForFunction(()=>document.getElementById('settings-status').textContent==='Paramètres enregistrés.');
  const saved=JSON.parse(fs.readFileSync(path.join(userData,'settings.json')));
  assert.equal(saved.ramMb,2048);assert.ok(saved.customJvmArgs.includes('two words'));
  await win.locator('#home-tab').click();
  await win.waitForTimeout(250);
  await win.screenshot({path:path.join(temporary,'packpanel-launcher-home-fr.png')});
  await win.locator('#language-en').click();
  await win.waitForTimeout(250);
  await win.screenshot({path:path.join(temporary,'packpanel-launcher-home-en.png')});
  await win.locator('#language-fr').click();
  await win.locator('#username').fill('ReleaseCheck');
  await win.locator('#play').click();
  async function waitGame(label) {
    const start=Date.now();let last=0;
    while(Date.now()-start<600000) {
      const state=await win.evaluate(()=>({status:document.getElementById('status').textContent,error:document.getElementById('status').className,logs:document.getElementById('logs').textContent}));
      if(Date.now()-last>20000){console.log(label+': '+state.status);last=Date.now();}
      if(state.error==='error')throw new Error(state.status+'\n'+state.logs.slice(-10000));
      if(/Created:.*textures\/atlas\/(?:gui|blocks)|OpenAL initialized on device|Sound engine started/.test(state.logs)) {
        console.log(label+': Minecraft renderer/audio initialized');
        fs.writeFileSync(path.join(temporary,'packpanel-game-'+label+'.log'),state.logs);
        return;
      }
      await new Promise(r=>setTimeout(r,1000));
    }
    throw new Error(label+': timeout waiting for actual Minecraft startup');
  }
  await waitGame('first-launch');
  const commands=await electron.evaluate(()=>process._getActiveHandles().filter(handle=>Array.isArray(handle.spawnargs)).map(handle=>handle.spawnargs));
  assert.ok(commands.some(args=>args.includes('-Xmx2048M') && args.includes('-Dpackpanel.label=two words')),'Selected memory and custom JVM arguments must reach the real game process');
  assert.equal(fs.readFileSync(path.join(gameDir,'config','release-check.txt'),'utf8'),'release one\n');
  await win.screenshot({path:path.join(temporary,'packpanel-launcher-running.png')});
  await win.locator('#stop').click();
  await new Promise(r=>setTimeout(r,3000));
  fs.mkdirSync(path.join(gameDir,'saves','release-check'),{recursive:true});
  fs.writeFileSync(path.join(gameDir,'saves','release-check','keep.txt'),'player data');
  fs.mkdirSync(path.join(gameDir,'mods'),{recursive:true});
  fs.writeFileSync(path.join(gameDir,'mods','obsolete-check.txt'),'obsolete');
  await api(`/endpoints/${session.instance.endpoint_id}/explorer/save-file`,{path:'config/release-check.txt',content:'release two\n',commitNow:true});
  await win.evaluate(()=>document.getElementById('logs').textContent='');
  await win.locator('#play').click();
  await waitGame('updated-launch');
  assert.equal(fs.readFileSync(path.join(gameDir,'config','release-check.txt'),'utf8'),'release two\n');
  assert.equal(fs.readFileSync(path.join(gameDir,'saves','release-check','keep.txt'),'utf8'),'player data');
  assert.ok(!fs.existsSync(path.join(gameDir,'mods','obsolete-check.txt')));
  assert.deepEqual(errors,[]);
  await win.screenshot({path:path.join(temporary,'packpanel-launcher-updated.png')});
  await win.locator('#stop').click();
  await new Promise(r=>setTimeout(r,2000));
  console.log('PASS: simplified downloaded launcher, player settings, offline launch, initial download, actual game startup, update, cleanup and preservation of player saves.');
  await electron.close();
})().catch(async error=>{console.error(error);if(electron)await electron.close().catch(()=>{});process.exitCode=1;});
