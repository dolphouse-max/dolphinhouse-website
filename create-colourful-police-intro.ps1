param([string]$Language = 'en')
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\gjpat\.codex\visualizations\2026\07\25\019f9725-e843-78c3-840c-539c3894ce28'
$images = Join-Path $root 'police-intro-images'
$audioDir = Join-Path $root "police-intro-$Language-audio"
$audioExtension = if ($Language -eq 'mr') { 'mp3' } else { 'wav' }
$out = Join-Path $root "checkin-police-colourful-intro-$Language.mp4"
$pptx = Join-Path $root "checkin-police-colourful-intro-$Language.pptx"
$slides = @(
  @{ image='01-alibaug-coast.png'; title='A safer, smarter\nAlibaug hospitality network'; body='Tourism grows when every guest feels welcome — and every hotel can work with public authorities responsibly.'; voice='Alibaug welcomes families, travellers and new opportunities every day. As hospitality grows, thoughtful coordination can help every hotel protect trust, respond faster to genuine enquiries, and keep the guest experience warm and welcoming.' },
  @{ image='02-welcome.png'; title='Hospitality begins\nwith care'; body='Hotels need to welcome guests beautifully while maintaining clear, responsible records.'; voice='For a hotel, every arrival is about care. Good records should support hospitality, not create extra pressure. Checkin helps participating hotels organise guest information in a simple and professional way.' },
  @{ image='03-coordination.png'; title='Responsible coordination\nwhen it matters'; body='Authorised access can help officers and hotels work together with clarity and respect.'; voice='When a legitimate police enquiry is needed, the right information should be reachable through a clear and accountable process. The aim is not to replace established procedure, but to support responsible coordination between authorised officers and hotels.' },
  @{ image='04-secure-network.png'; title='One proposal.\nA more accountable workflow.'; body='Search, review and audit access — designed for a pilot with hotels in Alibaug.'; voice='The proposed Police Access Module brings together authorised review, relevant hotel context and a record of access. We respectfully request approval to demonstrate and pilot this controlled workflow with hotels in Alibaug. Thank you for your consideration.' }
)

Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Path $audioDir -Force | Out-Null
$timings=@()
for($i=0;$i -lt $slides.Count;$i++){
  $wav=Join-Path $audioDir ('slide-{0:00}.' + $audioExtension -f ($i+1))
  $voice=New-Object System.Speech.Synthesis.SpeechSynthesizer
  $voice.SelectVoice('Microsoft Heera'); $voice.Rate=-2; $voice.SetOutputToWaveFile($wav); $voice.Speak($slides[$i].voice); $voice.Dispose()
  $timings += [math]::Round(((Get-Item $wav).Length-44)/(24000*2)+0.8,2)
}

function RGB($color,$r,$g,$b){$color.RGB=$r+($g*256)+($b*65536)}
$powerpoint=New-Object -ComObject PowerPoint.Application; $powerpoint.Visible=-1; $deck=$null
try{
  $deck=$powerpoint.Presentations.Add(); $deck.PageSetup.SlideWidth=1920; $deck.PageSetup.SlideHeight=1080
  for($i=0;$i -lt $slides.Count;$i++){
    $slide=$deck.Slides.Add($deck.Slides.Count+1,12); $slide.FollowMasterBackground=$false
    $path=Join-Path $images $slides[$i].image; $slide.Shapes.AddPicture($path,$false,$true,0,0,1920,1080)|Out-Null
    $shade=$slide.Shapes.AddShape(1,0,0,920,1080); $shade.Line.Visible=$false; RGB $shade.Fill.ForeColor 5 24 46; $shade.Fill.Transparency=0.17
    $tag=$slide.Shapes.AddTextbox(1,100,120,650,40); $tag.TextFrame.TextRange.Text='CHECKIN  |  POLICE ACCESS MODULE'; $tag.TextFrame.TextRange.Font.Name='Aptos Display';$tag.TextFrame.TextRange.Font.Size=15;$tag.TextFrame.TextRange.Font.Bold=$true;RGB $tag.TextFrame.TextRange.Font.Color 116 226 236;$tag.Line.Visible=$false;$tag.Fill.Visible=$false
    $title=$slide.Shapes.AddTextbox(1,100,220,700,250);$title.TextFrame.TextRange.Text=$slides[$i].title;$title.TextFrame.TextRange.Font.Name='Aptos Display';$title.TextFrame.TextRange.Font.Size=43;$title.TextFrame.TextRange.Font.Bold=$true;RGB $title.TextFrame.TextRange.Font.Color 255 255 255;$title.Line.Visible=$false;$title.Fill.Visible=$false
    $body=$slide.Shapes.AddTextbox(1,104,520,670,130);$body.TextFrame.TextRange.Text=$slides[$i].body;$body.TextFrame.TextRange.Font.Name='Aptos';$body.TextFrame.TextRange.Font.Size=20;RGB $body.TextFrame.TextRange.Font.Color 225 237 245;$body.Line.Visible=$false;$body.Fill.Visible=$false
    $wav=Join-Path $audioDir ('slide-{0:00}.' + $audioExtension -f ($i+1));$sound=$slide.Shapes.AddMediaObject2($wav,$false,$true,0,0,1,1);$sound.AnimationSettings.PlaySettings.PlayOnEntry=$true;$sound.AnimationSettings.PlaySettings.HideWhileNotPlaying=$true
    $slide.SlideShowTransition.EntryEffect=3849;$slide.SlideShowTransition.Speed=2;$slide.SlideShowTransition.AdvanceOnTime=$true;$slide.SlideShowTransition.AdvanceTime=$timings[$i]
  }
  if(Test-Path $pptx){Remove-Item $pptx -Force};if(Test-Path $out){Remove-Item $out -Force};$deck.SaveAs($pptx);$deck.CreateVideo($out,$true,5,1920,30,85)
  Start-Sleep -Seconds 20;$deadline=(Get-Date).AddMinutes(12);$last=-1;$stable=0;while((Get-Date)-lt $deadline){$len=if(Test-Path $out){(Get-Item $out).Length}else{0};if($len -gt 1048576 -and $len -eq $last){$stable++}else{$stable=0};if($stable -ge 3){break};$last=$len;Start-Sleep 10};if(-not(Test-Path $out) -or (Get-Item $out).Length -lt 1048576){throw 'Video export failed'};Get-Item $out|Select-Object FullName,Length
}finally{if($deck){try{$deck.Close()}catch{}};$powerpoint.Quit()}
