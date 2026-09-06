import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'vite'
import { saveReport } from './report.mjs'

const { values } = parseArgs({ options: { out:{type:'string'}, 'playwright-package':{type:'string'} } })
if (!values.out) throw new Error('Provide a private --out directory')
const require = createRequire(values['playwright-package'] ? path.resolve(values['playwright-package']) : import.meta.url)
const report = {schema:1,layer:'isolated-pet-ui-and-ownership',startedAt:new Date().toISOString(),checks:[],manual:[{id:'VOICE-DEVICE',reason:'Actual phone sound, focus, and screen-off acceptance remain manual.'}]}
let server, browser
try {
  await mkdir(values.out,{recursive:true})
  server = await createServer({ root:fileURLToPath(new URL('../../client/',import.meta.url)),server:{host:'127.0.0.1',port:0,open:false},logLevel:'error' })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await require('playwright').chromium.launch({channel:'msedge',headless:true})
  const page = await browser.newPage()
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
  async function check(id,reason,fn) {
    const start=performance.now()
    try {await fn();report.checks.push({id,reason,status:'pass',ms:Math.round(performance.now()-start)})}
    catch(e){
      await page.screenshot({path:path.join(values.out, id + '-failed.png')})
      const geometry=await page.locator('dialog, dialog textarea, .pet-sidechat-sheet').evaluateAll(nodes=>nodes.map(node=>({tag:node.tagName,box:node.getBoundingClientRect().toJSON(),scrollHeight:node.scrollHeight,style:node.getAttribute('style')})))
      report.checks.push({id,reason:`${reason} ${String(e.message).slice(0,240)}`,geometry,status:'fail',ms:Math.round(performance.now()-start)})
    }
  }
  const insideBody = async locator => {
    const visible = await locator.evaluate(node => {
      const rect = node.getBoundingClientRect(), body = node.closest('.pet-sidechat-body').getBoundingClientRect()
      return rect.top >= body.top - 1 && rect.bottom <= body.bottom + 1
    })
    if (!visible) throw new Error('Requested control is clipped outside the sidechat scroll viewport')
  }
  await check('PET-UI-COST', 'Voice estimate remains accessible with text hidden, without widening the page.', async () => {
    await page.setViewportSize({width:360,height:780})
    await page.goto(`${origin}/qa/pet-sheet.html`,{timeout:30000})
    await page.waitForFunction(()=>window.petQa?.pet.status==='ready')
    // Fixture already has an active synthetic call; do not toggle its controls.
    await page.getByRole('button',{name:'Hide sidechat transcript',exact:true}).click()
    const cost = page.locator('summary').filter({hasText:'Voice response estimate'})
    try {
      await cost.click()
      if (!await page.getByText(/Response cost only/).isVisible()) throw new Error('Pricing caveat hidden')
      const box = await cost.boundingBox()
      if (!box || box.x < 0 || box.x + box.width > 361) throw new Error('Cost widens voice page')
    } finally {
      await page.getByRole('button',{name:'Show sidechat transcript',exact:true}).click()
    }
  })
  for(const [width,height] of [[320,700],[360,780],[740,360]]) await check(`PET-UI-${width}`,'Compact heading, single-line voice action, composer and warning remain inside the viewport.',async()=>{
    await page.setViewportSize({width,height})
    await page.goto(`${origin}/qa/pet-sheet.html`,{timeout:30000})
    await page.waitForFunction(()=>window.petQa?.pet.status==='ready')
    const rects=await page.evaluate(()=>Object.fromEntries(['.pet-sidechat-sheet','.pet-sidechat-heading','.pet-sidechat-composer','.pet-realtime-button'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}]})))
    for(const r of Object.values(rects)) if(r.x<0||r.y<0||r.right>width+1||r.bottom>height+1) throw new Error(`Out of viewport: ${JSON.stringify(rects)}`)
    if(rects['.pet-sidechat-heading'].height>60||rects['.pet-realtime-button'].height>42) throw new Error(`Wrapped controls: ${JSON.stringify(rects)}`)
    if(rects['.pet-realtime-button'].y<rects['.pet-sidechat-heading'].bottom)throw new Error('Voice action clipped by heading')
    if(await page.getByText('Talk privately with',{exact:false}).count()) throw new Error('Empty placeholder competes with live transcript')
    await page.screenshot({path:path.join(values.out,`pet-${width}.png`)})
  })
  await check('PET-UI-HIDE','Hide text hides conversation only; the dedicated page and controls retain stable geometry.',async()=>{
    await page.setViewportSize({width:360,height:780})
    // The visualViewport resize event is asynchronous. Measure Hide only after
    // the preceding landscape-to-portrait operation has reached the new bounds.
    await page.waitForFunction(()=>Math.abs(document.querySelector('.voice-page').getBoundingClientRect().height-window.innerHeight)<1)
    const before=await page.locator('.pet-sidechat-sheet').boundingBox()
    await page.getByRole('button',{name:'Hide sidechat transcript'}).click()
    if(await page.getByText('A live synthetic spoken response.',{exact:true}).count()) throw new Error('Live text remains')
    if(!await page.getByRole('button',{name:'End live voice'}).isVisible()) throw new Error('Voice control hidden')
    const after=await page.locator('.pet-sidechat-sheet').boundingBox()
    if(Math.abs(after.height-before.height)>1) throw new Error(`Hide text resized the dedicated page: ${before.height} -> ${after.height}`)
    await page.getByRole('button',{name:'Show sidechat transcript'}).click()
  })
  await check('PET-AUDIO-LEASE','Live voice suppresses pending generation, clicks and playback without altering preferences; release restores them.',async()=>{
    await page.evaluate(()=>window.petQa.pet.updatePreferences({speakCommentary:true}))
    await page.waitForFunction(()=>window.petQa.pet.preferences.speakCommentary === true)
    await page.evaluate(()=>{void window.petQa.pet.generateCommentary()})
    await page.waitForFunction(()=>window.petQa.calls.includes('pet.commentary.generate'))
    const preferences=await page.evaluate(()=>JSON.stringify(window.petQa.pet.preferences))
    await page.evaluate(()=>{window.petQa.pet.setVoiceActive(true);window.petQa.finish();window.petQa.pet.interact();void window.petQa.pet.generateCommentary()})
    await page.waitForFunction(()=>window.petQa.pet.bubble==='')
    if(await page.evaluate(()=>window.petQa.spoken!==0||window.petQa.calls.filter(x=>x==='pet.commentary.generate').length!==1))throw new Error('Voice lease allowed commentary')
    await page.evaluate(()=>window.petQa.pet.setVoiceActive(false))
    await page.evaluate(()=>window.petQa.pet.interact())
    await page.waitForFunction(()=>window.petQa.spoken===1)
    if(await page.evaluate(()=>JSON.stringify(window.petQa.pet.preferences))!==preferences)throw new Error('Preferences changed')
  })
  await check('PET-UI-SCROLL','New sidechat messages retain a user-scrolled position rather than forcing the bottom.',async()=>{
    await page.evaluate(()=>window.petQa.fill())
    await page.waitForFunction(()=>document.querySelectorAll('.pet-sidechat-message').length >= 20)
    await page.locator('.pet-sidechat-messages').evaluate(node=>{node.scrollTop=100;node.dispatchEvent(new Event('scroll'))})
    const before=await page.locator('.pet-sidechat-messages').evaluate(node=>node.scrollTop)
    await page.evaluate(()=>window.petQa.append())
    await page.waitForFunction(()=>document.querySelectorAll('.pet-sidechat-message').length >= 21)
    const after=await page.locator('.pet-sidechat-messages').evaluate(node=>node.scrollTop)
    if(Math.abs(before-after)>1)throw new Error(`Scroll moved ${before} to ${after}`)
  })
  await check('PET-UI-REVIEW','Hidden chat opens the actual approval inside the scroll viewport, not just mounted below old history.',async()=>{
    await page.goto(`${origin}/qa/pet-sheet.html`,{timeout:30000})
    await page.waitForFunction(()=>window.petQa?.pet.status==='ready')
    await page.evaluate(()=>window.petQa.fill())
    await page.waitForFunction(()=>document.querySelectorAll('.pet-sidechat-message').length>=20)
    await page.evaluate(()=>window.petQa.requestReview())
    await page.getByRole('button',{name:'Review Hermes request'}).click()
    if(!await page.locator('textarea').evaluateAll(nodes=>nodes.some(node=>node.value==='Synthetic reviewed request')))throw new Error('Reviewed text is missing')
    if(!await page.locator('.pet-sidechat-sheet').isVisible())throw new Error('Review did not open the sheet')
    await insideBody(page.getByRole('textbox',{name:'Hermes request draft',exact:true}))
    await page.getByRole('button',{name:'Hide sidechat transcript'}).click()
    await page.getByRole('button',{name:'Show sidechat transcript'}).click()
    await page.locator('.pet-sidechat-messages').evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'))})
    await insideBody(page.getByRole('button',{name:'Send to Hermes',exact:true}))
    for (const name of ['Send to Hermes', 'Cancel']) {
      const button = await page.getByRole('button', {name, exact:true}).boundingBox()
      if (!button || button.height > 42 || button.width > 180) throw new Error('Review action stretched into a large panel')
    }
    const review = await page.locator('.pet-realtime-hermes-draft').boundingBox()
    const editor = await page.getByRole('textbox', {name:'Hermes request draft',exact:true}).boundingBox()
    if (!review || !editor || editor.height < review.height - 125) throw new Error('Review leaves available space unused while its editor scrolls')
    await insideBody(page.getByRole('textbox',{name:'Hermes request draft',exact:true}))
    await page.setViewportSize({width:740,height:360})
    await page.evaluate(()=>{
      document.documentElement.style.setProperty('--android-safe-bottom','24px')
      document.documentElement.style.setProperty('--android-safe-left','28px')
    })
    await page.waitForFunction(()=>{const r=document.querySelector('.pet-sidechat-sheet').getBoundingClientRect(); return r.x>=28 && r.y+r.height<=337})
    const safe=await page.locator('.pet-sidechat-sheet').boundingBox()
    if(safe.x<28||safe.y+safe.height>337)throw Error('Native navigation/cutout insets ignored')
    await page.evaluate(()=>{
      document.documentElement.style.removeProperty('--android-safe-bottom')
      document.documentElement.style.removeProperty('--android-safe-left')
    })
    await page.getByRole('button',{name:'Close pet sidechat'}).click()
  })
  await check('PET-UI-SETTINGS-HYDRATION','Explicit settings navigation survives late history and live text updates without scrolling its controls away.',async()=>{
    await page.goto(`${origin}/qa/pet-sheet.html`,{timeout:30000})
    await page.waitForFunction(()=>window.petQa?.pet.status==='ready')
    await page.getByRole('button',{name:'Close pet sidechat'}).click()
    await page.getByRole('button',{name:'Live voice settings',exact:true}).click()
    if(await page.locator('details.pet-realtime-settings').getAttribute('open')===null)throw new Error('Settings did not open')
    await page.evaluate(()=>window.petQa.fill())
    await page.waitForFunction(()=>document.querySelectorAll('.pet-sidechat-message').length>=20)
    await insideBody(page.getByRole('combobox',{name:'Pet live voice',exact:true}))
    await page.evaluate(()=>window.petQa.append())
    await page.waitForFunction(()=>document.querySelectorAll('.pet-sidechat-message').length>=21)
    await insideBody(page.getByRole('combobox',{name:'Pet live voice',exact:true}))
  })
  await check('PET-UI-INDEPENDENT-SCROLL','Showing and scrolling long text cannot cover voice controls or settings.',async()=>{
    await page.getByRole('button',{name:'Hide sidechat transcript'}).click()
    await page.getByRole('button',{name:'Show sidechat transcript'}).click()
    const controls=await page.locator('.pet-realtime-controls').boundingBox()
    await page.locator('.pet-sidechat-messages').evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'))})
    await insideBody(page.getByRole('combobox',{name:'Pet live voice',exact:true}))
    const after=await page.locator('.pet-realtime-controls').boundingBox()
    if(controls.y!==after.y)throw new Error('Transcript moved voice controls')
    await page.screenshot({path:path.join(values.out,'independent-controls.png')})
  })
  await check('VOICE-PAGE-ROTATE','Rotation and keyboard-sized viewports preserve a whole voice page, draft and reachable controls.',async()=>{
    await page.goto(`${origin}/qa/pet-sheet.html`,{timeout:30000})
    await page.waitForFunction(()=>window.petQa?.pet.status==='ready')
    await page.evaluate(()=>window.petQa.fill())
    const draft=page.getByRole('textbox',{name:'Message A companion with a very long name',exact:true})
    await draft.fill('Unsent synthetic draft')
    for(const [width,height] of [[360,780],[740,360],[740,240],[360,420],[360,780]]) {
      await page.setViewportSize({width,height})
      await page.waitForFunction(h=>Math.abs(document.querySelector('.voice-page').getBoundingClientRect().height-h)<2,height)
      const geometry=await page.evaluate(()=>{
        const selectors=['.voice-page','.pet-sidechat-messages','.pet-sidechat-composer','.pet-realtime-controls']
        return selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height}})
      })
      for(const r of geometry) if(r.x<0||r.y<0||r.right>width+1||r.bottom>height+1||r.height<30)throw Error(`Clipped page: ${JSON.stringify(geometry)}`)
      if(await draft.inputValue()!=='Unsent synthetic draft')throw Error('Rotation lost draft')
      if(!await page.locator('.mobile-workspace').evaluate(n=>n.inert))throw Error('Background remained interactive')
      if(!await page.getByRole('button',{name:'End live voice'}).isVisible())throw Error('Voice controls vanished')
      await page.screenshot({path:path.join(values.out,`voice-page-${width}-${height}.png`)})
    }
    await page.getByRole('button',{name:'Close pet sidechat'}).click()
    if(await page.locator('.mobile-workspace').evaluate(n=>n.inert))throw Error('Back did not restore session interaction')
    await page.getByRole('button',{name:'Open voice conversation',exact:true}).click()
    if(await page.locator('details.pet-realtime-settings').getAttribute('open')!==null)throw Error('Voice navigation unexpectedly opened settings')
    if(!await page.getByRole('button',{name:'End live voice'}).isVisible())throw Error('Back ended call')
    if(await draft.inputValue()!=='Unsent synthetic draft')throw Error('Back lost draft')
  })
  await check('WAKE-THREE-PHRASES','The bundled tokenizer produces three distinct keyword definitions for one native recognizer.',async()=>{
    const definitions=await page.evaluate(()=>window.petQa.buildKeywords())
    const lines=definitions.trim().split('\n')
    if(lines.length!==3 || new Set(lines.map(line=>line.split(' @')[1])).size!==3)throw new Error('Wake actions did not get distinct keywords')
  })
  await check('VOICE-REVIEW-HERE','Required review opens over the current page, grows text before scrolling, keeps actions compact and sends only edited text.',async()=>{
    await page.setViewportSize({width:360,height:780})
    await page.goto(`${origin}/qa/pet-sheet.html`,{timeout:30000})
    await page.waitForFunction(()=>window.petQa?.pet.status==='ready')
    await page.evaluate(()=>window.petQa.reviewHere('Complete instruction. '.repeat(80)))
    const modal = page.getByRole('dialog',{name:'Review Hermes request',exact:true})
    await modal.waitFor()
    if(await page.locator('.pet-sidechat-sheet').count())throw Error('Approval navigated into pet page')
    const editor=modal.getByRole('textbox',{name:'Hermes request draft',exact:true})
    await page.waitForFunction(()=>document.querySelector('dialog textarea').getBoundingClientRect().height>300)
    await page.screenshot({path:path.join(values.out,'review-here-portrait.png')})
    for(const name of ['Send to Hermes','Cancel','Later']) {
      const r=await modal.getByRole('button',{name,exact:true}).boundingBox()
      if(!r||r.height>44||r.width>180)throw Error('Oversized review action')
    }
    await modal.getByRole('button',{name:'Later',exact:true}).click()
    await page.getByRole('button',{name:'Review request',exact:true}).click()
    for (const [width,height] of [[740,360],[740,240],[360,780]]) {
      await page.setViewportSize({width,height})
      await page.waitForFunction(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return r.x>=0 && r.y>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1})
    }
    await editor.fill('Only inspect this build.')
    await modal.getByRole('button',{name:'Send to Hermes',exact:true}).click()
    await modal.waitFor({state:'detached'})
    if(!await page.evaluate(()=>window.petQa.calls.includes('approved:Only inspect this build.')))throw Error('Wrong reviewed text')
    if(await page.locator('.pet-sidechat-sheet').count())throw Error('Approval changed underlying page')
  })
  await check('VOICE-CATALOG-LATE','Late or incomplete catalogs cannot clear a saved provider, voice or instructions.',async()=>{
    await page.evaluate(()=>window.petQa.showCatalog())
    await page.getByText('Normal read-aloud voice',{exact:true}).waitFor()
    if(await page.getByLabel('Read-aloud provider',{exact:true}).inputValue()!=='saved-provider')throw new Error('Initial saved provider lost')
    if(await page.getByLabel('Read-aloud voice',{exact:true}).inputValue()!=='saved-voice')throw new Error('Initial saved voice lost')
    await page.evaluate(()=>window.petQa.finishCatalog())
    await page.getByRole('option',{name:'other-provider',exact:true}).waitFor({state:'attached'})
    if(await page.getByLabel('Read-aloud provider',{exact:true}).inputValue()!=='saved-provider')throw new Error('Late catalog replaced saved provider')
    if(await page.evaluate(()=>window.petQa.catalogChanges.length)!==0)throw new Error('Catalog performed an unsolicited preference write')
  })
} finally {
  await browser?.close();await server?.close()
  const summary=await saveReport(values.out,{...report,finishedAt:new Date().toISOString()})
  console.log(JSON.stringify(summary));if(summary.failed)process.exitCode=1
}
