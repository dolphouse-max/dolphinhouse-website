$ErrorActionPreference = 'Stop'
$outputDirectory = 'C:\Users\gjpat\.codex\visualizations\2026\07\25\019f9725-e843-78c3-840c-539c3894ce28\police-narration-local'
$narration = @(
  'Good day. This is a demonstration of the Checkin Police Access Module, proposed to support responsible coordination between authorised police personnel and participating hotels in Alibaug. The objective is simple: when a legitimate enquiry arises, the officer should be able to review relevant hotel guest information quickly, clearly and with a proper record of access. The system is designed as a role-focused reporting tool. It does not replace police procedure, and it is intended to operate only with appropriate authorisation, safeguards and cooperation from the hotels.',
  'The Police Reports home is the officer''s starting point. It brings the main enquiry options together in one clean, mobile-friendly workspace. From this page, an officer can move to an all-hotels search, hotel details, current guests, guest register, staff register and access logs. The layout makes the next step obvious, even during a time-sensitive enquiry. The system can also retain selected report filters on the device, so that an officer can continue a review without repeatedly entering the same working details.',
  'For a specific property enquiry, the Police Access Console provides a controlled route to records. Before a lookup is made, the officer enters a name and selects the relevant hotel. The enquiry is therefore linked to an identifiable officer and a defined property. This creates a clear context for the request. Where the hotel has recorded supporting proof for a guest, the module can make that evidence available within the authorised review flow, rather than leaving officers to search across separate registers and messages.',
  'The Current Guests report gives rapid visibility of the guests presently staying at the selected hotel. This is useful when an officer needs a current occupancy view, for example during a welfare check, verification exercise or other operational enquiry. The report is designed to be searched and reviewed on a phone as well as a larger screen. It keeps the information focused on the selected property, making it easier to identify the relevant guest record while avoiding unnecessary navigation through unrelated hotel data.',
  'For enquiries covering an earlier period, the Guest Register provides a date-based view of check-ins and check-outs. The officer can narrow the displayed records by guest name, mobile number, room, vehicle number, ID type or ID number. Once the relevant set has been reviewed, it can be exported as a CSV file for an official follow-up process. This supports a more structured workflow than relying on informal messages or manually maintained paper registers, while retaining the familiar information that officers need during a guest-record enquiry.',
  'The Hotel Details report adds property context before an officer reviews a guest record. It presents the hotel identity, available contact details and high-level occupancy information in one place. This helps confirm that the officer has selected the intended property and gives a quick operational picture of the location. The Staff Register is also available from the same Police Reports workspace, providing the hotel team''s recorded role, contact and active-status details when a staff-related verification is necessary.',
  'Accountability is an essential part of the design. The Access Logs report records police report access activity so that the review process itself can be examined later. This makes the system more transparent for all parties: the police, the participating hotels and the service provider. Officer-attributed access history can be searched when required, creating an audit trail that supports responsible data governance. The proposed module is therefore not only about speed; it is about making the handling of sensitive guest information more disciplined, visible and reviewable.',
  'In summary, Checkin offers a practical Police Access Module for authorised review of hotel guest information: one place to search participating hotels, examine current and historical registers, view supporting details where available, and maintain an access record. We respectfully request approval to demonstrate and pilot this controlled workflow with hotels in Alibaug, under guidance from the Superintendent of Police''s office. The aim is safer, faster and more accountable coordination in support of lawful police enquiries. Thank you for your consideration.'
)

Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$clips = @()
for ($i = 0; $i -lt $narration.Count; $i++) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice('Microsoft Heera')
  $synth.Rate = -1
  $file = Join-Path $outputDirectory ('slide-{0:00}.wav' -f ($i + 1))
  $synth.SetOutputToWaveFile($file)
  $synth.Speak($narration[$i])
  $synth.Dispose()
  $seconds = [math]::Round(((Get-Item -LiteralPath $file).Length - 44) / (24000 * 2), 2)
  $clips += [PSCustomObject]@{ slide = $i + 1; file = $file; seconds = $seconds; text = $narration[$i] }
}
$clips | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $outputDirectory 'timings.json')
$clips | Select-Object slide,seconds | Format-Table -AutoSize
