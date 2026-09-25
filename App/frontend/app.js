let apiUrl;
let schema;
let busy = false;
let hasResult = false;
let revision = 0;
const $ = id => document.getElementById(id);
const form = $('predict-form');
const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
const percent = value => typeof value === 'number' && Number.isFinite(value) ? (value * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%' : 'Không có';
const fields = {
 age:['Tuổi','năm'], bp:['Huyết áp','mmHg'], sg:['Tỷ trọng nước tiểu',''],
 al:['Albumin trong nước tiểu','mức'], su:['Đường trong nước tiểu','mức'],
 bgr:['Đường huyết ngẫu nhiên','mg/dL'], bu:['Urê máu','mg/dL'], sc:['Creatinine huyết thanh','mg/dL'],
 sod:['Natri','mEq/L'], pot:['Kali','mEq/L'], hemo:['Hemoglobin','g/dL'], pcv:['Thể tích hồng cầu','%'],
 wc:['Số lượng bạch cầu','/µL'], rc:['Số lượng hồng cầu','triệu/µL'],
 rbc:['Hồng cầu trong nước tiểu',''], pc:['Tế bào mủ',''], pcc:['Cụm tế bào mủ',''], ba:['Vi khuẩn',''],
 htn:['Tăng huyết áp',''], dm:['Đái tháo đường',''], cad:['Bệnh động mạch vành',''],
 appet:['Cảm giác thèm ăn',''], pe:['Phù chi',''], ane:['Thiếu máu','']
};
const categoryLabels = { normal:'Bình thường', abnormal:'Bất thường', present:'Có', notpresent:'Không', yes:'Có', no:'Không', good:'Tốt', poor:'Kém' };
const groups = [
 ['Thông tin chung',['age','bp']],
 ['Chỉ số xét nghiệm máu',['bgr','bu','sc','sod','pot','hemo','pcv','wc','rc']],
 ['Chỉ số xét nghiệm nước tiểu',['sg','al','su','rbc','pc','pcc','ba']],
 ['Tiền sử & triệu chứng',['htn','dm','cad','appet','pe','ane']]
];
const sampleFeatures = {
 age:48,bp:80,sg:1.02,al:1,su:0,bgr:120,bu:36,sc:1.2,sod:138,pot:4.2,hemo:13.5,pcv:42,wc:8000,rc:5,
 rbc:'normal',pc:'normal',pcc:'notpresent',ba:'notpresent',htn:'no',dm:'no',cad:'no',appet:'good',pe:'no',ane:'no'
};
function requestId() {
 return globalThis.crypto?.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
}
async function api(path, options = {}) {
 const id = requestId();
 console.info(JSON.stringify({ timestamp:new Date().toISOString(), service:'frontend', request_id:id, event:'request_started', path }));
 const response = await fetch(apiUrl + path, {...options, headers:{'Content-Type':'application/json','X-Request-ID':id},signal:AbortSignal.timeout(30000)});
 let body;
 try { body = await response.json(); } catch { throw new Error('Không đọc được phản hồi máy chủ. Vui lòng thử lại.'); }
 if (!response.ok) throw new Error((body.detail || body.error || 'Yêu cầu thất bại') + ' (request_id: ' + (body.request_id || id) + ')');
 return body;
}
function addField(name, host) {
 const [title, unit] = fields[name] || [name,''];
 const wrapper = document.createElement('div'); wrapper.className='field';
 const label = document.createElement('label'); label.htmlFor='f-'+name; label.textContent=title;
 const code=document.createElement('span'); code.className='field-code'; code.textContent=name; label.append(code);
 const control=document.createElement('div'); control.className='control';
 const categories=schema.allowed_categories[name];
 const input=document.createElement(categories?'select':'input');
 input.id='f-'+name; input.name=name; input.required=true; input.setAttribute('aria-describedby','hint-'+name);
 if(categories) {
  input.add(new Option('Chọn giá trị',''));
  categories.forEach(value=>input.add(new Option(categoryLabels[value] || value,value)));
 } else {
  input.type='number'; input.inputMode='decimal'; input.step='any';
  input.min=schema.numeric_ranges[name].min; input.max=schema.numeric_ranges[name].max;
  input.placeholder='Nhập giá trị';
 }
 control.append(input);
 if(unit) {const span=document.createElement('span');span.className='unit';span.textContent=unit;control.append(span);}
 const hint=document.createElement('p'); hint.className='hint';hint.id='hint-'+name;
 hint.textContent=categories?'Chọn theo thông tin đã có.':'Khoảng dữ liệu: '+number.format(Number(input.min))+'–'+number.format(Number(input.max))+(unit?' '+unit:'')+'.';
 wrapper.append(label,control,hint);host.append(wrapper);
}
function buildForm() {
 const rendered=new Set();
 for(const [title,names] of [...groups,['Đặc trưng khác',schema.features.filter(name=>!groups.some(([,keys])=>keys.includes(name)))]]) {
  const active=names.filter(name=>schema.features.includes(name) && !rendered.has(name));
  if(!active.length) continue;
  const group=document.createElement('fieldset');group.className='field-group';
  const legend=document.createElement('legend');legend.textContent=title;
  const grid=document.createElement('div');grid.className='field-grid';
  for(const name of active){addField(name,grid);rendered.add(name);}
  group.append(legend,grid);$('fields').append(group);
 }
}
function changed() {
 revision++;
 if(hasResult) $('stale-notice').hidden=false;
}
function displayValue(name,value) {
 return schema.allowed_categories[name] ? (categoryLabels[value] || value) : number.format(value)+(fields[name]?.[1]?' '+fields[name][1]:'');
}
function renderResult(data,features) {
 renderCalculation(data.explanation);
 hasResult=true;
 $('prediction-label').textContent=data.prediction==='ckd'?'Mô hình phân loại: CKD':data.prediction==='notckd'?'Mô hình phân loại: không CKD':data.prediction;
 $('probability').textContent=percent(data.probability);
 $('probability-fill').style.width=typeof data.probability==='number' ? Math.max(0,Math.min(100,data.probability*100))+'%' : '0%';
 $('result-caption').textContent='Phiên bản '+data.model_version+' · Đã lưu vào lịch sử';
 $('result').textContent='Nhãn dự đoán: '+data.prediction+'\nXác suất lớp ckd: '+percent(data.probability)+'\nPhiên bản model: '+data.model_version+'\nRequest ID: '+data.request_id;
 $('submitted-values').replaceChildren();
 for(const name of schema.features) {
  const row=document.createElement('tr');
  for(const value of [fields[name]?.[0] || name,displayValue(name,features[name])]) {const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
  $('submitted-values').append(row);
 }
}
function renderCalculation(explanation) {
 const available=explanation?.available === true;
 $('calculation-content').hidden=!available;
 $('calculation-placeholder').hidden=available;
 $('calculation-terms').replaceChildren();
 if(!available) {
  $('calculation-placeholder').textContent=explanation?.reason || 'Model chưa cung cấp cách tính chi tiết.';
  return;
 }
 const fmt=value=>Number(value).toLocaleString('vi-VN',{minimumFractionDigits:5,maximumFractionDigits:5});
 $('calculation-formula').textContent='Hệ số chặn b = '+fmt(explanation.intercept)+
  '\nTổng đóng góp Σ(w × x′) = '+fmt(explanation.contribution_sum)+
  '\nz = b + Σ(w × x′) = '+fmt(explanation.score)+
  '\nP(CKD) = 1 / (1 + exp(−z)) = '+percent(explanation.probability);
 for(const term of [...explanation.terms].sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution))) {
  const name=term.feature.includes('__')?term.feature.split('__').slice(1).join('__'):term.feature;
  const key=schema.features.find(key=>name===key || name.startsWith(key+'_'));
  const category=key && name.startsWith(key+'_')?name.slice(key.length+1):'';
  const label=(fields[key]?.[0] || name)+(category?' = '+(categoryLabels[category] || category):'');
  const row=document.createElement('tr');
  for(const value of [label,fmt(term.transformed_value),fmt(term.coefficient),fmt(term.contribution)]) {
   const cell=document.createElement('td');cell.textContent=value;row.append(cell);
  }
  $('calculation-terms').append(row);
 }
}
async function init() {
 const response=await fetch('/config.json',{cache:'no-store'});
 if(!response.ok) throw new Error('Không tải được cấu hình');
 apiUrl=(await response.json()).api_url.replace(/\/$/,'');
 const [definition,info]=await Promise.all([api('/schema'),api('/model-info')]);
 schema=definition;buildForm();
 const meta=info.metadata;
 const modelName=meta.model_name==='logistic_regression'?'Logistic Regression':meta.model_name;
 $('model-info').textContent=modelName+' · Phiên bản '+meta.model_version;
 const metricNames={accuracy:'Accuracy',precision:'Precision',recall:'Recall',f1:'F1-score',roc_auc:'ROC-AUC'};
 for(const [key,label] of Object.entries(metricNames)) {
  if(typeof meta.metrics?.[key]!=='number') continue;
  const card=document.createElement('div');card.className='metric';
  const title=document.createElement('span');title.textContent=label;
  const value=document.createElement('strong');value.textContent=key==='roc_auc'?number.format(meta.metrics[key]):percent(meta.metrics[key]);
  card.append(title,value);$('metrics').append(card);
 }
 $('submit').disabled=false;$('sample').disabled=false;
 $('status').textContent='Sẵn sàng. Nhập thông tin hoặc điền dữ liệu mẫu.';
}
form.addEventListener('input',changed);
$('sample').addEventListener('click',()=>{
 for(const [name,value] of Object.entries(sampleFeatures)){const input=form.elements.namedItem(name);if(input) input.value=value;}
 changed();$('status').textContent='Đã điền dữ liệu mẫu. Bấm Dự đoán để gửi.';
});
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(busy || !form.reportValidity()) return;
 busy=true;$('submit').disabled=true;$('sample').disabled=true;
 const sentRevision=revision;
 $('status').textContent='Đang dự đoán…';
 try {
  const features=Object.fromEntries(new FormData(form).entries());
  schema.numeric_features.forEach(name=>{features[name]=Number(features[name]);});
  const data=await api('/predict',{method:'POST',body:JSON.stringify({features})});
  renderResult(data,features);
  $('stale-notice').hidden=revision===sentRevision;
  $('status').textContent='Đã dự đoán và lưu lịch sử.';
  } catch(error){$('status').textContent='Dự đoán chưa thành công: '+error.message;}
 finally{busy=false;$('submit').disabled=false;$('sample').disabled=false;}
});
init().catch(error=>{$('status').textContent='Không khởi tạo được ứng dụng: '+error.message;});
