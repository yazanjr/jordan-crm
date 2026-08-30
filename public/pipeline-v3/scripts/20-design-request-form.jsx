// =============================================================================
// DESIGN REQUEST FORM — multi-step modal that digitizes the IMG paper forms:
//   • نموذج استلام التكييف   (AC / HVAC)
//   • نموذج استلام تدفئة     (Heating)
// 4 steps: 1) pick form type · 2) common fields · 3) AC or Heating specific · 4) review & submit.
// Replaces the simple RequestDesignModal in 12-popups.jsx — wiring (deal/kind/priorRequestId/
// onSubmitted) stays identical so 13-app.jsx and 11-deal-detail.jsx need no changes.
//
// Data shape MUST stay in sync with deriveMirrors() in routes/design.js — that helper
// reads form_type / ac.system_types / heating.pool.present / heating.solar.present and
// mirrors them into indexed columns for SQL filtering.
// =============================================================================

(function () {
  const { ModalShell, Btn, Field, TextInput, Select, inputStyle } = window.PopupShell;

  // ---------- design tokens reused from popups.jsx ----------
  const sectionStyle = {
    padding: '14px 16px', border: '1px solid var(--border-subtle)', borderRadius: 10,
    background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 12,
  };
  const sectionHeader = {
    display: 'flex', alignItems: 'baseline', gap: 8,
    fontSize: 12.5, fontWeight: 700, color: 'var(--fg-primary)',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const arabicHint = { fontSize: 11, fontWeight: 500, color: 'var(--fg-tertiary)', direction: 'rtl' };
  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };

  // ---------- tiny presentational helpers ----------
  function Section({ title, ar, children, dense }) {
    return (
      <div style={{ ...sectionStyle, padding: dense ? '12px 14px' : '14px 16px' }}>
        <div style={sectionHeader}>
          <span>{title}</span>
          {ar && <span style={arabicHint}>{ar}</span>}
        </div>
        {children}
      </div>
    );
  }

  function RadioGroup({ value, onChange, options, name }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map(opt => {
          const v = typeof opt === 'string' ? opt : opt.value;
          const label = typeof opt === 'string' ? opt : opt.label;
          const ar = typeof opt === 'string' ? null : opt.ar;
          const active = value === v;
          return (
            <label key={v} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--img-orange)' : 'var(--border-default)'}`,
              background: active ? 'var(--img-orange-50)' : 'var(--bg-surface)',
              color: active ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-primary)',
              fontSize: 12.5, fontWeight: active ? 600 : 500,
            }}>
              <input type="radio" name={name} checked={active} onChange={() => onChange(v)}
                style={{ accentColor: 'var(--img-orange)' }} />
              <span>{label}{ar && <span style={{ marginInlineStart: 6, ...arabicHint, fontSize: 10.5 }}>{ar}</span>}</span>
            </label>
          );
        })}
      </div>
    );
  }

  function CheckboxGroup({ values = [], onChange, options }) {
    const toggle = (v) => onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map(opt => {
          const v = typeof opt === 'string' ? opt : opt.value;
          const label = typeof opt === 'string' ? opt : opt.label;
          const ar = typeof opt === 'string' ? null : opt.ar;
          const active = values.includes(v);
          return (
            <label key={v} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--img-orange)' : 'var(--border-default)'}`,
              background: active ? 'var(--img-orange-50)' : 'var(--bg-surface)',
              fontSize: 12.5, fontWeight: active ? 600 : 500,
              color: active ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-primary)',
            }}>
              <input type="checkbox" checked={active} onChange={() => toggle(v)}
                style={{ accentColor: 'var(--img-orange)' }} />
              <span>{label}{ar && <span style={{ marginInlineStart: 6, ...arabicHint, fontSize: 10.5 }}>{ar}</span>}</span>
            </label>
          );
        })}
      </div>
    );
  }

  function TextArea(props) {
    return (
      <textarea {...props}
        style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical', fontFamily: 'inherit', width: '100%', minHeight: props.rows ? undefined : 80, ...(props.style || {}) }}
        onFocus={e => { e.target.style.borderColor = 'var(--img-orange)'; e.target.style.boxShadow = 'var(--shadow-focus)'; }}
        onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; }} />
    );
  }

  function FileList({ files, onChange, hint }) {
    const [name, setName] = React.useState('');
    const add = () => {
      if (!name.trim()) return;
      onChange([...files, { name: name.trim(), size: Math.round(Math.random() * 3000000) + 200000 }]);
      setName('');
    };
    return (
      <div style={{
        padding: 10, border: '1px dashed var(--border-default)', borderRadius: 7,
        background: 'var(--neutral-25)', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="e.g. mechanical-plans.pdf" style={{ flex: 1, ...inputStyle }} />
          <Btn kind="secondary" size="sm" onClick={add} disabled={!name.trim()}>Add</Btn>
        </div>
        {files.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--bg-surface)', borderRadius: 5, fontSize: 11.5 }}>
            <span style={{ flex: 1 }}>{f.name}</span>
            <button onClick={() => onChange(files.filter((_, j) => j !== i))}
              style={{ border: 'none', background: 'transparent', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        ))}
        {files.length === 0 && <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{hint || 'No files attached.'}</div>}
      </div>
    );
  }

  // ---------- default form_data shape (kept in one place so review/render can rely on it) ----------
  function makeBlankForm() {
    return {
      form_type: null, // set in step 1
      basic: { project_name: '', engineer: '', contractor: '', consultant: '', architect: '', city: '' },
      design_type: 'IMG',
      project_nature: 'Including tax & customs',
      warranty: { kind: 'Standard', details: '' },
      preventive_maintenance: { years: '', visits_per_year: '' },
      insulation: { walls: '', ceiling: '', windows: '' },
      deliverables: { submittal: false, compliance: false, financial_offer: false, plans: false },
      requirements: {
        north_direction: 'Plans', north_link: '',
        elevation: 'Available', floor_heights: '',
        total_floors: '', total_floor_names: '',
        serviced_floors: '', serviced_floor_names: '',
      },
      attachments: [],
      urgency: 'Standard',
      salesman_notes: '',
      ac: {
        system_types: [], vrf_brand: '', lcac_subtype: '', rac_brand: '',
        indoor_units: { ducted: {sel:false, floors:''}, cassette: {sel:false, floors:''}, floor_stand: {sel:false, floors:''}, wall_mounted: {sel:false, floors:''}, ahu_kit: {sel:false, floors:''} },
        control_system: { central: '', bms: '', multi_tenant: '', key_card: '' },
        electricity: '',
        mechanical_ventilation: { kind: '', floors: '' },
        outdoor_location: '',
        copper_piping: '', extra_copper_split: '', copper_vrf: '',
        ductwork: '',
        max_false_ceiling_drop: '',
        air_outlet_types: [],
        bathroom_branch: '', existing_heating: '',
      },
      heating: {
        radiators: '', underfloor: '', plumbing: '',
        pipe_type: { radiators: '', underfloor: '', plumbing: '' },
        radiator: { floors: '', height: '', towel_rails: 'All bathrooms', towel_other: '' },
        underfloor_floors: '',
        main_lines: '',
        heat_source: { kind: '', count: '', serves: '' },
        pool: { present: 'No', length: '', width: '', depth: '', temperature: '', users: '', source: '', period: '', cover: '', wind_barriers: '', shelter: '', surrounding_heated: '' },
        solar: { present: false, location: '', roof_type: '', area: '', vertical_distance: '', horizontal_distance: '' },
        boiler_room_location: '',
        cylinders: { kind: '', count: '' },
        pumps: { lifting: false, pressure: false, wastewater: false, rain: false },
        accessories: { price_optional: false, full_diematic: false, boiler_supplies: false },
      },
    };
  }

  // ---------- the main modal ----------
  function DesignRequestForm({ deal, kind = 'new', priorRequestId, oppDbMap, onClose, onSubmitted }) {
    const isMod = kind === 'modification';
    const [step, setStep] = React.useState(1);
    const [form, setForm] = React.useState(() => {
      const blank = makeBlankForm();
      // Pre-fill basic info from the deal so the salesman doesn't re-type it.
      blank.basic.project_name = deal?.name || '';
      blank.basic.contractor   = deal?.contractor || '';
      blank.basic.city         = deal?.district || '';
      return blank;
    });
    const [error, setError]   = React.useState(null);
    const [submitting, setSubmitting] = React.useState(false);
    const [loading, setLoading] = React.useState(isMod);

    // For modification: fetch the prior request and pre-fill the form.
    React.useEffect(() => {
      if (!isMod || !priorRequestId) return;
      let cancelled = false;
      (async () => {
        try {
          const prior = await window.api.get(`/design-requests/${priorRequestId}`);
          if (cancelled) return;
          if (prior?.form_data && typeof prior.form_data === 'object' && Object.keys(prior.form_data).length > 0) {
            const merged = { ...makeBlankForm(), ...prior.form_data };
            // Always start the modification at step 2 (form-type already known).
            setForm(merged);
            if (merged.form_type) setStep(2);
          }
        } catch (e) {
          setError('Could not load previous request — starting from blank.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [isMod, priorRequestId]);

    // Generic setter helper so step components stay terse.
    const set = (path, value) => {
      setForm(f => {
        const next = JSON.parse(JSON.stringify(f));
        const parts = path.split('.');
        let obj = next;
        for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
        obj[parts[parts.length - 1]] = value;
        return next;
      });
    };

    // Prefer the deal's real DB id (always current, present on every API-loaded
    // deal). Fall back to the title→id map only if dbId is somehow missing.
    // The old title-only lookup failed for newly created deals (not yet in the
    // page-load snapshot) and for any title mismatch.
    const dbOppId = deal.dbId ?? oppDbMap?.[deal.name];

    const submit = async () => {
      // Phase 3 — modifications must carry a reason so we can track patterns.
      if (isMod && !form.modification_reason) {
        setError('Pick a reason for this modification before submitting.');
        return;
      }
      // Rework analysis — modifications must also carry a cause (who/what drove it).
      if (isMod && !form.modification_cause) {
        setError('Pick what drove this modification before submitting.');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const payload = {
          project_type: isMod ? 'Modification' : 'New Design',
          urgency: form.urgency,
          salesman_notes: form.salesman_notes,
          site_plans: form.attachments,
          form_data: form,
        };
        if (isMod) { payload.modification_reason = form.modification_reason; payload.modification_cause = form.modification_cause; }
        let result;
        if (isMod && priorRequestId) {
          result = await window.api.post(`/design-requests/${priorRequestId}/revision`, payload);
        } else {
          if (!dbOppId) throw new Error(`Opportunity "${deal.name}" not found in DB — run the design seed.`);
          result = await window.api.post(`/design-requests`, { ...payload, opportunity_id: dbOppId });
        }
        onSubmitted?.(result);
      } catch (e) {
        setError(e.message);
      } finally {
        setSubmitting(false);
      }
    };

    // Step navigation guards
    const canAdvance = (() => {
      if (step === 1) return !!form.form_type;
      if (step === 2) return form.basic.project_name.trim().length > 1;
      if (step === 3) return true;
      return true;
    })();

    // The Step 3 component is chosen by form_type
    const lastStep = 4;
    const onNext = () => {
      if (step < lastStep) setStep(step + 1);
      else submit();
    };
    const onBack = () => setStep(s => Math.max(1, s - 1));

    if (loading) {
      return (
        <ModalShell title={isMod ? 'Request modification' : 'Request design'}
          subtitle={`${deal?.name || ''}`} onClose={onClose} width={760}>
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-secondary)' }}>Loading previous request…</div>
        </ModalShell>
      );
    }

    return (
      <ModalShell
        title={isMod ? 'Request modification' : 'Request design'}
        subtitle={`${deal?.name || ''}${deal?.account ? ' · ' + deal.account : ''}`}
        onClose={onClose}
        width={780}
        footer={
          <>
            {step > 1 && <Btn kind="ghost" onClick={onBack}>Back</Btn>}
            <div style={{ flex: 1 }} />
            <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
            <Btn kind="primary" disabled={!canAdvance || submitting} onClick={onNext}>
              {submitting ? 'Submitting…'
                : step === lastStep ? (isMod ? 'Submit modification' : 'Submit to design')
                : 'Next'}
            </Btn>
          </>
        }
      >
        <Stepper step={step} total={lastStep} formType={form.form_type} />
        {error && (
          <div style={{ margin: '0 20px 0', padding: 10, background: 'var(--color-danger-bg)', color: '#B0241D', borderRadius: 6, fontSize: 12 }}>{error}</div>
        )}
        {/* Phase 3 — modification reason picker, always visible in modification mode */}
        {isMod && (
          <div style={{ padding: '12px 20px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>
              Reason for modification (required)
            </span>
            <select value={form.modification_reason || ''}
              onChange={e => set('modification_reason', e.target.value)}
              style={{ padding: '7px 9px', fontSize: 13, borderRadius: 6,
                border: `1px solid ${form.modification_reason ? 'var(--border-default)' : '#B0241D'}`,
                background: 'var(--bg-surface)', color: 'var(--fg-primary)' }}>
              <option value="">Select a reason…</option>
              <option>Price</option>
              <option>Technical change</option>
              <option>Scope change</option>
              <option>Client request</option>
              <option>Other</option>
            </select>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', marginTop: 4 }}>
              What drove this modification? (required)
            </span>
            <select value={form.modification_cause || ''}
              onChange={e => set('modification_cause', e.target.value)}
              style={{ padding: '7px 9px', fontSize: 13, borderRadius: 6,
                border: `1px solid ${form.modification_cause ? 'var(--border-default)' : '#B0241D'}`,
                background: 'var(--bg-surface)', color: 'var(--fg-primary)' }}>
              <option value="">Select a cause…</option>
              <option>Internal — sizing/selection error</option>
              <option>External — client/consultant change</option>
              <option>Commercial — price/value engineering</option>
            </select>
          </div>
        )}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {step === 1 && <Step1FormType value={form.form_type} onPick={(t) => { set('form_type', t); setStep(2); }} />}
          {step === 2 && <Step2Common form={form} set={set} />}
          {step === 3 && form.form_type === 'AC' && <Step3AC form={form} set={set} />}
          {step === 3 && form.form_type === 'Heating' && <Step3Heating form={form} set={set} />}
          {step === 4 && <Step4Review form={form} />}
        </div>
      </ModalShell>
    );
  }

  // ---------- stepper indicator ----------
  function Stepper({ step, total, formType }) {
    const labels = ['Form type', 'Basic info', formType === 'Heating' ? 'Heating details' : 'AC details', 'Review'];
    return (
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--neutral-25)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {labels.slice(0, total).map((lbl, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <React.Fragment key={n}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '5px 10px', borderRadius: 999,
                background: active ? 'var(--img-orange)' : done ? 'var(--img-orange-50)' : 'transparent',
                color: active ? '#fff' : done ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-tertiary)',
                fontSize: 11.5, fontWeight: 600,
                border: active ? 'none' : `1px solid ${done ? 'var(--img-orange)' : 'var(--border-subtle)'}`,
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 999,
                  background: active ? '#fff' : done ? 'var(--img-orange)' : 'var(--bg-surface)',
                  color: active ? 'var(--img-orange)' : done ? '#fff' : 'var(--fg-tertiary)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, border: active ? 'none' : `1px solid ${done ? 'var(--img-orange)' : 'var(--border-subtle)'}`,
                }}>{done ? '✓' : n}</span>
                {lbl}
              </div>
              {n < total && <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // ============================================================================
  // STEP 1 — pick form type
  // ============================================================================
  function Step1FormType({ value, onPick }) {
    const cards = [
      { v: 'AC',      title: 'AC / HVAC System', ar: 'تكييف', subtitle: 'VRF · LCAC · RAC · Applied · ductwork · controls', emoji: '❄️' },
      { v: 'Heating', title: 'Heating System',   ar: 'تدفئة', subtitle: 'Radiators · underfloor · pool · solar · boilers', emoji: '🔥' },
    ];
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg-secondary)', marginBottom: 14 }}>
          What kind of design does this opportunity need? <span style={arabicHint}>أي نموذج تريد تعبئته؟</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {cards.map(c => {
            const active = value === c.v;
            return (
              <button key={c.v} onClick={() => onPick(c.v)} style={{
                padding: '20px 18px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${active ? 'var(--img-orange)' : 'var(--border-default)'}`,
                background: active ? 'var(--img-orange-50)' : 'var(--bg-surface)',
                textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6,
                transition: 'transform 120ms, border-color 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--img-orange)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = active ? 'var(--img-orange)' : 'var(--border-default)'; }}>
                <div style={{ fontSize: 28 }}>{c.emoji}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg-primary)' }}>
                  {c.title} <span style={{ ...arabicHint, fontSize: 13, marginInlineStart: 6 }}>{c.ar}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{c.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP 2 — common fields
  // ============================================================================
  function Step2Common({ form, set }) {
    const b = form.basic;
    return (
      <>
        <Section title="Basic info" ar="المعلومات الأساسية">
          <div style={grid2}>
            <Field label="Project name" required>
              <TextInput value={b.project_name} onChange={e => set('basic.project_name', e.target.value)} />
            </Field>
            <Field label="City المدينة">
              <TextInput value={b.city} onChange={e => set('basic.city', e.target.value)} />
            </Field>
            <Field label="Engineer المهندس">
              <TextInput value={b.engineer} onChange={e => set('basic.engineer', e.target.value)} />
            </Field>
            <Field label="Contractor المقاول">
              <TextInput value={b.contractor} onChange={e => set('basic.contractor', e.target.value)} />
            </Field>
            <Field label="Consultant الاستشاري">
              <TextInput value={b.consultant} onChange={e => set('basic.consultant', e.target.value)} />
            </Field>
            <Field label="Architect المعماري">
              <TextInput value={b.architect} onChange={e => set('basic.architect', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Design type" ar="التصميم المطلوب">
          <RadioGroup name="design_type" value={form.design_type} onChange={v => set('design_type', v)}
            options={[
              { value: 'IMG',        label: 'IMG Design',        ar: 'تصميم مرجي' },
              { value: 'Consultant', label: 'Consultant Design', ar: 'تصميم استشاري' },
            ]} />
        </Section>

        <Section title="Project nature" ar="طبيعة المشروع">
          <RadioGroup name="project_nature" value={form.project_nature} onChange={v => set('project_nature', v)}
            options={[
              { value: 'Including tax & customs', label: 'Including tax & customs', ar: 'شامل الضريبة والجمرك' },
              { value: 'Exempt',                  label: 'Exempt customs & tax',    ar: 'معفي جمرك وضريبة' },
              { value: 'Tax exempt only',         label: 'Tax exempt only',         ar: 'معفي ضريبة فقط' },
            ]} />
        </Section>

        <Section title="Warranty" ar="الكفالة">
          <RadioGroup name="warranty" value={form.warranty.kind} onChange={v => set('warranty.kind', v)}
            options={['Standard', 'Extended']} />
          {form.warranty.kind === 'Extended' && (
            <Field label="Extended warranty details">
              <TextInput value={form.warranty.details} onChange={e => set('warranty.details', e.target.value)}
                placeholder="e.g. 5 years parts + labour" />
            </Field>
          )}
        </Section>

        <Section title="Preventive maintenance" ar="الصيانة الوقائية">
          <div style={grid2}>
            <Field label="Number of years عدد السنوات">
              <TextInput type="number" min="0" value={form.preventive_maintenance.years}
                onChange={e => set('preventive_maintenance.years', e.target.value)} />
            </Field>
            <Field label="Visits per year عدد الزيارات">
              <TextInput type="number" min="0" value={form.preventive_maintenance.visits_per_year}
                onChange={e => set('preventive_maintenance.visits_per_year', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Insulation" ar="معلومات العزل">
          <div style={grid3}>
            <Field label="Walls الجدران">
              <RadioGroup name="walls" value={form.insulation.walls} onChange={v => set('insulation.walls', v)}
                options={[{ value: 'Insulated', label: 'Insulated', ar: 'معزول' }, { value: 'Not insulated', label: 'Not', ar: 'غير معزول' }]} />
            </Field>
            <Field label="Ceiling السقف">
              <RadioGroup name="ceiling" value={form.insulation.ceiling} onChange={v => set('insulation.ceiling', v)}
                options={[{ value: 'Insulated', label: 'Insulated', ar: 'معزول' }, { value: 'Not insulated', label: 'Not', ar: 'غير معزول' }]} />
            </Field>
            <Field label="Windows الشبابيك">
              <RadioGroup name="windows" value={form.insulation.windows} onChange={v => set('insulation.windows', v)}
                options={['Single Glass', 'Double Glass']} />
            </Field>
          </div>
        </Section>

        <Section title="Deliverables" ar="المخرجات المطلوبة">
          <CheckboxGroup
            values={Object.keys(form.deliverables).filter(k => form.deliverables[k])}
            onChange={(arr) => {
              const next = { submittal: false, compliance: false, financial_offer: false, plans: false };
              arr.forEach(k => { next[k] = true; });
              set('deliverables', next);
            }}
            options={[
              { value: 'submittal',       label: 'Submittal' },
              { value: 'compliance',      label: 'Compliance' },
              { value: 'financial_offer', label: 'Financial offer' },
              { value: 'plans',           label: 'Plans' },
            ]} />
        </Section>

        <Section title="Project requirements" ar="متطلبات المشروع">
          <Field label="North direction">
            <RadioGroup name="north" value={form.requirements.north_direction}
              onChange={v => set('requirements.north_direction', v)}
              options={['Plans', 'Google Maps']} />
          </Field>
          {form.requirements.north_direction === 'Google Maps' && (
            <Field label="Google Maps link">
              <TextInput value={form.requirements.north_link}
                onChange={e => set('requirements.north_link', e.target.value)}
                placeholder="https://maps.google.com/…" />
            </Field>
          )}
          <Field label="Elevation plans">
            <RadioGroup name="elev" value={form.requirements.elevation}
              onChange={v => set('requirements.elevation', v)}
              options={[{ value: 'Available', label: 'Available', ar: 'يوجد' }, { value: 'Not available', label: 'Not available', ar: 'لا يوجد' }]} />
          </Field>
          {form.requirements.elevation === 'Not available' && (
            <Field label="Floor heights — describe per floor" hint="ارتفاع الطوابق المراد تدفئتها/تكييفها">
              <TextArea value={form.requirements.floor_heights} rows={3}
                onChange={e => set('requirements.floor_heights', e.target.value)} />
            </Field>
          )}
          <div style={grid2}>
            <Field label="Total floors count">
              <TextInput type="number" min="0" value={form.requirements.total_floors}
                onChange={e => set('requirements.total_floors', e.target.value)} />
            </Field>
            <Field label="Total floor names" hint="e.g. B1, GF, 1, 2, Roof">
              <TextInput value={form.requirements.total_floor_names}
                onChange={e => set('requirements.total_floor_names', e.target.value)} />
            </Field>
            <Field label="Floors to be serviced — count">
              <TextInput type="number" min="0" value={form.requirements.serviced_floors}
                onChange={e => set('requirements.serviced_floors', e.target.value)} />
            </Field>
            <Field label="Serviced floor names">
              <TextInput value={form.requirements.serviced_floor_names}
                onChange={e => set('requirements.serviced_floor_names', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Attachments & notes">
          <Field label="Mechanical plans, quantities, specs, drawings">
            <FileList files={form.attachments} onChange={v => set('attachments', v)} />
          </Field>
          <Field label="Urgency">
            <RadioGroup name="urgency" value={form.urgency} onChange={v => set('urgency', v)}
              options={['Standard', 'Urgent', 'Critical']} />
          </Field>
          <Field label="Notes for the design team">
            <TextArea value={form.salesman_notes} rows={4}
              onChange={e => set('salesman_notes', e.target.value)}
              placeholder="Constraints, expected close date, anything Sally or the designer needs to know…" />
          </Field>
        </Section>
      </>
    );
  }

  // ============================================================================
  // STEP 3a — AC fields
  // ============================================================================
  function Step3AC({ form, set }) {
    const ac = form.ac;
    const sysSelected = (s) => ac.system_types.includes(s);
    return (
      <>
        <Section title="System type" ar="نوع النظام">
          <CheckboxGroup
            values={ac.system_types}
            onChange={v => set('ac.system_types', v)}
            options={[
              { value: 'VRF',     label: 'VRF' },
              { value: 'LCAC',    label: 'LCAC' },
              { value: 'RAC',     label: 'RAC' },
              { value: 'Applied', label: 'Applied (needs PM approval)' },
            ]} />
          {sysSelected('VRF') && (
            <Field label="VRF brand">
              <Select value={ac.vrf_brand} onChange={e => set('ac.vrf_brand', e.target.value)}
                options={['', 'Gree SASO', 'Gree HR', 'Mitsubishi YKD', 'Mitsubishi YNW', 'Mitsubishi HR']
                  .map(v => ({ value: v, label: v || '— select —' }))} />
            </Field>
          )}
          {sysSelected('LCAC') && (
            <Field label="LCAC sub-type">
              <Select value={ac.lcac_subtype} onChange={e => set('ac.lcac_subtype', e.target.value)}
                options={['', 'Gree Cassette', 'Gree Ducted', 'Gree Free Stand']
                  .map(v => ({ value: v, label: v || '— select —' }))} />
            </Field>
          )}
          {sysSelected('RAC') && (
            <Field label="RAC brand">
              <Select value={ac.rac_brand} onChange={e => set('ac.rac_brand', e.target.value)}
                options={['', 'Gree', 'Mitsubishi'].map(v => ({ value: v, label: v || '— select —' }))} />
            </Field>
          )}
        </Section>

        {sysSelected('VRF') && (
          <Section title="Indoor units (VRF)" ar="الوحدات الداخلية">
            {Object.entries({
              ducted: 'Ducted', cassette: 'Cassette', floor_stand: 'Floor stand',
              wall_mounted: 'Wall mounted', ahu_kit: 'AHU Kit',
            }).map(([k, label]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 160, fontSize: 13 }}>
                  <input type="checkbox" checked={ac.indoor_units[k].sel}
                    onChange={e => set(`ac.indoor_units.${k}.sel`, e.target.checked)}
                    style={{ accentColor: 'var(--img-orange)' }} />
                  {label}
                </label>
                <input value={ac.indoor_units[k].floors}
                  onChange={e => set(`ac.indoor_units.${k}.floors`, e.target.value)}
                  placeholder="Which floors? e.g. GF, 1, 2"
                  disabled={!ac.indoor_units[k].sel}
                  style={{ ...inputStyle, flex: 1, opacity: ac.indoor_units[k].sel ? 1 : 0.5 }} />
              </div>
            ))}
          </Section>
        )}

        <Section title="Control system">
          {[
            ['central',     'Central controller'],
            ['bms',         'BMS integration'],
            ['multi_tenant','Multi-tenant control'],
            ['key_card',    'Key card (hotel)'],
          ].map(([k, label]) => (
            <Field key={k} label={label}>
              <RadioGroup name={'cs_' + k} value={ac.control_system[k]}
                onChange={v => set(`ac.control_system.${k}`, v)}
                options={['Yes', 'No']} />
            </Field>
          ))}
        </Section>

        <Section title="Electricity">
          <RadioGroup name="elec" value={ac.electricity} onChange={v => set('ac.electricity', v)}
            options={['1 Phase', '3 Phase']} />
        </Section>

        <Section title="Mechanical ventilation" ar="التهوية الميكانيكية">
          <RadioGroup name="mv" value={ac.mechanical_ventilation.kind}
            onChange={v => set('ac.mechanical_ventilation.kind', v)}
            options={['Yes', 'No']} />
          {ac.mechanical_ventilation.kind === 'Yes' && (
            <Field label="Which floors?">
              <TextInput value={ac.mechanical_ventilation.floors}
                onChange={e => set('ac.mechanical_ventilation.floors', e.target.value)}
                placeholder="e.g. B1, GF" />
            </Field>
          )}
        </Section>

        <Section title="Outdoor units location" ar="موقع الوحدات الخارجية">
          <RadioGroup name="outdoor" value={ac.outdoor_location}
            onChange={v => set('ac.outdoor_location', v)}
            options={[
              { value: 'Roof',           label: 'Roof', ar: 'السطح' },
              { value: 'Basement-Garage',label: 'Basement / Garage' },
              { value: 'Building Facade',label: 'Building facade', ar: 'واجهة المبنى' },
              { value: 'Back to Back',   label: 'Back to back' },
              { value: 'Other',          label: 'Other' },
            ]} />
        </Section>

        <Section title="Copper piping" ar="تمديد انابيب النحاس">
          <Field label="Routing">
            <RadioGroup name="copper" value={ac.copper_piping}
              onChange={v => set('ac.copper_piping', v)}
              options={[
                { value: 'Through shaft', label: 'Through shaft', ar: 'منور' },
                { value: 'Wall channels', label: 'Wall channels', ar: 'اساليف' },
              ]} />
          </Field>
          <div style={grid2}>
            <Field label="Calculate extra copper (Split)">
              <RadioGroup name="copper_split" value={ac.extra_copper_split}
                onChange={v => set('ac.extra_copper_split', v)}
                options={['Yes', 'No']} />
            </Field>
            <Field label="VRF copper calculation">
              <RadioGroup name="copper_vrf" value={ac.copper_vrf}
                onChange={v => set('ac.copper_vrf', v)}
                options={['Budgetary', 'Actual']} />
            </Field>
          </div>
        </Section>

        <Section title="Ductwork" ar="اعمال الدكت">
          <RadioGroup name="duct" value={ac.ductwork} onChange={v => set('ac.ductwork', v)}
            options={[
              { value: 'Pre-Insulated', label: 'Pre-insulated' },
              { value: 'Sheet Metal',   label: 'Sheet metal', ar: 'صاج' },
            ]} />
        </Section>

        <Section title="Additional info">
          <Field label="Maximum false ceiling drop allowed (cm)">
            <TextInput type="number" min="0" value={ac.max_false_ceiling_drop}
              onChange={e => set('ac.max_false_ceiling_drop', e.target.value)} />
          </Field>
          <Field label="Air outlet types" ar="نوع مخارج الهواء">
            <CheckboxGroup values={ac.air_outlet_types}
              onChange={v => set('ac.air_outlet_types', v)}
              options={['Linear Slot', 'Linear Bar', 'Diffuser', 'Flow Bar', 'Grilles']} />
          </Field>
          <div style={grid2}>
            <Field label="Bathroom branch from AC unit">
              <RadioGroup name="bath" value={ac.bathroom_branch}
                onChange={v => set('ac.bathroom_branch', v)}
                options={['Yes', 'No']} />
            </Field>
            <Field label="Existing heating system in project" ar="وجود نظام تدفئة">
              <RadioGroup name="exh" value={ac.existing_heating}
                onChange={v => set('ac.existing_heating', v)}
                options={['Yes', 'No']} />
            </Field>
          </div>
        </Section>
      </>
    );
  }

  // ============================================================================
  // STEP 3b — Heating fields
  // ============================================================================
  function Step3Heating({ form, set }) {
    const h = form.heating;
    return (
      <>
        <Section title="Heating system" ar="النظام">
          <Field label="Radiators رديترات">
            <RadioGroup name="rad" value={h.radiators} onChange={v => set('heating.radiators', v)}
              options={['', 'Standard Chrome', 'Scanex Copper'].map(v => v || { value: '', label: '— None —' })} />
          </Field>
          <Field label="Underfloor heating تحت البلاط">
            <RadioGroup name="uf" value={h.underfloor} onChange={v => set('heating.underfloor', v)}
              options={['', 'Standard', 'Scanex'].map(v => v || { value: '', label: '— None —' })} />
          </Field>
          <Field label="Plumbing الصحي">
            <RadioGroup name="plumb" value={h.plumbing} onChange={v => set('heating.plumbing', v)}
              options={['', 'Standard', 'Scanex', '3 Collectors'].map(v => v || { value: '', label: '— None —' })} />
          </Field>
        </Section>

        <Section title="Pipe type" ar="نوع الانابيب">
          <div style={grid3}>
            <Field label="For radiators">
              <RadioGroup name="pt_r" value={h.pipe_type.radiators}
                onChange={v => set('heating.pipe_type.radiators', v)}
                options={['Penta', 'RixC 0.2']} />
            </Field>
            <Field label="For underfloor">
              <RadioGroup name="pt_u" value={h.pipe_type.underfloor}
                onChange={v => set('heating.pipe_type.underfloor', v)}
                options={['Penta', 'RixC 0.2']} />
            </Field>
            <Field label="For plumbing">
              <RadioGroup name="pt_p" value={h.pipe_type.plumbing}
                onChange={v => set('heating.pipe_type.plumbing', v)}
                options={['Penta', 'RixC 0.2']} />
            </Field>
          </div>
        </Section>

        <Section title="Radiator details">
          <div style={grid2}>
            <Field label="Floors with radiators" hint="الطوابق المراد تدفئتها بالرديترات">
              <TextInput value={h.radiator.floors}
                onChange={e => set('heating.radiator.floors', e.target.value)} />
            </Field>
            <Field label="Radiator height">
              <RadioGroup name="rh" value={h.radiator.height}
                onChange={v => set('heating.radiator.height', v)}
                options={['40cm', '60cm']} />
            </Field>
          </div>
          <Field label="Heated towel rails" ar="علاقات البشاكير المدفأة">
            <RadioGroup name="trails" value={h.radiator.towel_rails}
              onChange={v => set('heating.radiator.towel_rails', v)}
              options={['All bathrooms', 'Other']} />
          </Field>
          {h.radiator.towel_rails === 'Other' && (
            <Field label="Specify which bathrooms">
              <TextInput value={h.radiator.towel_other}
                onChange={e => set('heating.radiator.towel_other', e.target.value)} />
            </Field>
          )}
        </Section>

        <Section title="Underfloor heating details">
          <Field label="Floors with underfloor heating">
            <TextInput value={h.underfloor_floors}
              onChange={e => set('heating.underfloor_floors', e.target.value)} />
          </Field>
        </Section>

        <Section title="Main lines" ar="الخطوط الرئيسية">
          <RadioGroup name="ml" value={h.main_lines} onChange={v => set('heating.main_lines', v)}
            options={[
              { value: 'To shaft',  label: 'To shaft',  ar: 'للمنور' },
              { value: 'To boiler', label: 'To boiler', ar: 'للبويلر' },
              { value: 'None',      label: 'None',      ar: 'بدون' },
            ]} />
        </Section>

        <Section title="Heat source" ar="مصدر التسخين">
          <Field label="Type">
            <RadioGroup name="hs" value={h.heat_source.kind}
              onChange={v => set('heating.heat_source.kind', v)}
              options={[
                'Diesel', 'Gas Non-Condensing', 'Gas Condensing',
                'Nesma Heat Pump (commercial)', 'Gree Heat Pump',
              ]} />
          </Field>
          <div style={grid2}>
            <Field label="Count">
              <TextInput type="number" min="0" value={h.heat_source.count}
                onChange={e => set('heating.heat_source.count', e.target.value)} />
            </Field>
            <Field label="What does each serve?">
              <TextInput value={h.heat_source.serves}
                onChange={e => set('heating.heat_source.serves', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Swimming pool">
          <RadioGroup name="pool" value={h.pool.present}
            onChange={v => set('heating.pool.present', v)}
            options={['No', 'Yes (Outdoor)', 'Yes (Indoor)']} />
          {h.pool.present !== 'No' && (
            <>
              <div style={grid3}>
                <Field label="Length (m)"><TextInput type="number" value={h.pool.length} onChange={e => set('heating.pool.length', e.target.value)} /></Field>
                <Field label="Width (m)"><TextInput type="number" value={h.pool.width} onChange={e => set('heating.pool.width', e.target.value)} /></Field>
                <Field label="Avg depth (m)"><TextInput type="number" value={h.pool.depth} onChange={e => set('heating.pool.depth', e.target.value)} /></Field>
              </div>
              <div style={grid3}>
                <Field label="Target temp (°C)"><TextInput type="number" value={h.pool.temperature} onChange={e => set('heating.pool.temperature', e.target.value)} /></Field>
                <Field label="User count"><TextInput type="number" value={h.pool.users} onChange={e => set('heating.pool.users', e.target.value)} /></Field>
                <Field label="Heating source">
                  <Select value={h.pool.source} onChange={e => set('heating.pool.source', e.target.value)}
                    options={['', 'Solar', 'Heat Pump', 'Boiler'].map(v => ({ value: v, label: v || '— select —' }))} />
                </Field>
              </div>
              {h.pool.present === 'Yes (Outdoor)' && (
                <div style={grid2}>
                  <Field label="Operating period">
                    <TextInput value={h.pool.period} onChange={e => set('heating.pool.period', e.target.value)}
                      placeholder="e.g. June – September" />
                  </Field>
                  <Field label="Pool cover">
                    <RadioGroup name="cover" value={h.pool.cover}
                      onChange={v => set('heating.pool.cover', v)}
                      options={['Yes', 'No']} />
                  </Field>
                  <Field label="Wind barriers">
                    <RadioGroup name="wb" value={h.pool.wind_barriers}
                      onChange={v => set('heating.pool.wind_barriers', v)}
                      options={['Full barrier', 'Partial', 'None']} />
                  </Field>
                  <Field label="Shelter / cover structure">
                    <TextInput value={h.pool.shelter} onChange={e => set('heating.pool.shelter', e.target.value)} />
                  </Field>
                </div>
              )}
              {h.pool.present === 'Yes (Indoor)' && (
                <Field label="Surrounding pool area heated?">
                  <RadioGroup name="surr" value={h.pool.surrounding_heated}
                    onChange={v => set('heating.pool.surrounding_heated', v)}
                    options={['Yes', 'No']} />
                </Field>
              )}
            </>
          )}
        </Section>

        <Section title="Solar panels">
          <Field label="Use solar panels?">
            <RadioGroup name="solar" value={h.solar.present ? 'Yes' : 'No'}
              onChange={v => set('heating.solar.present', v === 'Yes')}
              options={['Yes', 'No']} />
          </Field>
          {h.solar.present && (
            <>
              <div style={grid2}>
                <Field label="Location">
                  <RadioGroup name="sloc" value={h.solar.location}
                    onChange={v => set('heating.solar.location', v)}
                    options={['Roof', 'Other']} />
                </Field>
                <Field label="Roof type">
                  <RadioGroup name="srt" value={h.solar.roof_type}
                    onChange={v => set('heating.solar.roof_type', v)}
                    options={[{ value: 'Flat', label: 'Flat', ar: 'مسطح' }, 'Tile']} />
                </Field>
              </div>
              <div style={grid3}>
                <Field label="Available area (m²)">
                  <TextInput type="number" value={h.solar.area}
                    onChange={e => set('heating.solar.area', e.target.value)} />
                </Field>
                <Field label="Vertical distance to boiler room (m)">
                  <TextInput type="number" value={h.solar.vertical_distance}
                    onChange={e => set('heating.solar.vertical_distance', e.target.value)} />
                </Field>
                <Field label="Horizontal distance to shaft (m)">
                  <TextInput type="number" value={h.solar.horizontal_distance}
                    onChange={e => set('heating.solar.horizontal_distance', e.target.value)} />
                </Field>
              </div>
            </>
          )}
        </Section>

        <Section title="Boiler room" ar="غرفة البويلر">
          <Field label="Location">
            <TextInput value={h.boiler_room_location}
              onChange={e => set('heating.boiler_room_location', e.target.value)} />
          </Field>
        </Section>

        <Section title="Cylinders" ar="السلندرات">
          <Field label="Type">
            <RadioGroup name="cyl" value={h.cylinders.kind}
              onChange={v => set('heating.cylinders.kind', v)}
              options={['Standard', 'Double Coil', 'Without']} />
          </Field>
          {h.cylinders.kind !== 'Without' && (
            <Field label="Count">
              <TextInput type="number" min="0" value={h.cylinders.count}
                onChange={e => set('heating.cylinders.count', e.target.value)} />
            </Field>
          )}
        </Section>

        <Section title="Pumps" ar="المضخات">
          <CheckboxGroup
            values={Object.keys(h.pumps).filter(k => h.pumps[k])}
            onChange={(arr) => {
              const next = { lifting: false, pressure: false, wastewater: false, rain: false };
              arr.forEach(k => { next[k] = true; });
              set('heating.pumps', next);
            }}
            options={[
              { value: 'lifting',    label: 'Lifting pump' },
              { value: 'pressure',   label: 'Pressure pump' },
              { value: 'wastewater', label: 'Wastewater pump' },
              { value: 'rain',       label: 'Rain drainage pump' },
            ]} />
        </Section>

        <Section title="Optional accessories">
          <CheckboxGroup
            values={Object.keys(h.accessories).filter(k => h.accessories[k])}
            onChange={(arr) => {
              const next = { price_optional: false, full_diematic: false, boiler_supplies: false };
              arr.forEach(k => { next[k] = true; });
              set('heating.accessories', next);
            }}
            options={[
              { value: 'price_optional',  label: 'Price optional sanitary / heating accessories' },
              { value: 'full_diematic',   label: 'Full Diematic control' },
              { value: 'boiler_supplies', label: 'Boiler room supplies' },
            ]} />
        </Section>
      </>
    );
  }

  // ============================================================================
  // STEP 4 — review (also reused on the Design Board to render a saved request)
  // ============================================================================
  function Step4Review({ form }) {
    const today = new Date().toISOString().slice(0, 10);
    const meName = window.CURRENT_USER?.name || 'You';
    return (
      <>
        <div style={{
          padding: '10px 12px', background: 'var(--neutral-25)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          fontSize: 12, color: 'var(--fg-secondary)',
          display: 'flex', justifyContent: 'space-between', gap: 8,
        }}>
          <span>Submitted by <strong style={{ color: 'var(--fg-primary)' }}>{meName}</strong></span>
          <span>{today}</span>
        </div>
        <window.DesignRequestSummary form={form} />
      </>
    );
  }

  // ============================================================================
  // PUBLIC SUMMARY VIEW — used by Step 4 and (later) by the Design Board card.
  // Pure read-only render of a form_data blob.
  // ============================================================================
  function DesignRequestSummary({ form }) {
    if (!form || !form.form_type) {
      return <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No form data captured.</div>;
    }
    const Row = ({ label, value }) => {
      if (value === null || value === undefined || value === '' || value === false) return null;
      return (
        <div style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '2px 0' }}>
          <span style={{ minWidth: 170, color: 'var(--fg-secondary)' }}>{label}</span>
          <span style={{ flex: 1, color: 'var(--fg-primary)', fontWeight: 500 }}>
            {Array.isArray(value) ? value.join(', ') : String(value)}
          </span>
        </div>
      );
    };

    const b = form.basic || {};
    const r = form.requirements || {};
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Section title={`Form: ${form.form_type === 'AC' ? 'AC / HVAC' : 'Heating'}`} dense>
          <Row label="Project" value={b.project_name} />
          <Row label="City" value={b.city} />
          <Row label="Engineer" value={b.engineer} />
          <Row label="Contractor" value={b.contractor} />
          <Row label="Consultant" value={b.consultant} />
          <Row label="Architect" value={b.architect} />
          <Row label="Design type" value={form.design_type} />
          <Row label="Project nature" value={form.project_nature} />
          <Row label="Warranty" value={form.warranty?.kind + (form.warranty?.details ? ' — ' + form.warranty.details : '')} />
          <Row label="Maintenance" value={`${form.preventive_maintenance?.years || '-'}y · ${form.preventive_maintenance?.visits_per_year || '-'} visits/yr`} />
          <Row label="Insulation" value={`Walls: ${form.insulation?.walls || '-'} · Ceiling: ${form.insulation?.ceiling || '-'} · Windows: ${form.insulation?.windows || '-'}`} />
          <Row label="Deliverables" value={Object.entries(form.deliverables || {}).filter(([, v]) => v).map(([k]) => k.replace('_',' ')).join(', ') || '—'} />
          <Row label="North direction" value={form.requirements?.north_direction + (r.north_link ? ' (' + r.north_link + ')' : '')} />
          <Row label="Elevation plans" value={r.elevation + (r.floor_heights ? ' — ' + r.floor_heights : '')} />
          <Row label="Floors total" value={r.total_floors && `${r.total_floors} (${r.total_floor_names})`} />
          <Row label="Floors serviced" value={r.serviced_floors && `${r.serviced_floors} (${r.serviced_floor_names})`} />
          <Row label="Urgency" value={form.urgency} />
          <Row label="Notes" value={form.salesman_notes} />
          <Row label="Attachments" value={(form.attachments || []).map(a => a.name).join(', ')} />
        </Section>
        {form.form_type === 'AC' && (
          <Section title="AC specifics" dense>
            <Row label="Systems" value={form.ac?.system_types} />
            <Row label="VRF brand" value={form.ac?.vrf_brand} />
            <Row label="LCAC sub-type" value={form.ac?.lcac_subtype} />
            <Row label="RAC brand" value={form.ac?.rac_brand} />
            {form.ac?.system_types?.includes('VRF') && (
              <Row label="Indoor units" value={
                Object.entries(form.ac.indoor_units || {})
                  .filter(([, v]) => v.sel)
                  .map(([k, v]) => `${k.replace('_',' ')}${v.floors ? ' (' + v.floors + ')' : ''}`)
                  .join(', ')
              } />
            )}
            <Row label="Control system" value={
              Object.entries(form.ac?.control_system || {})
                .filter(([, v]) => v)
                .map(([k, v]) => `${k.replace('_',' ')}: ${v}`).join(', ')
            } />
            <Row label="Electricity" value={form.ac?.electricity} />
            <Row label="Mechanical ventilation" value={form.ac?.mechanical_ventilation?.kind + (form.ac?.mechanical_ventilation?.floors ? ' — ' + form.ac.mechanical_ventilation.floors : '')} />
            <Row label="Outdoor units location" value={form.ac?.outdoor_location} />
            <Row label="Copper piping" value={form.ac?.copper_piping} />
            <Row label="Extra copper (Split)" value={form.ac?.extra_copper_split} />
            <Row label="VRF copper" value={form.ac?.copper_vrf} />
            <Row label="Ductwork" value={form.ac?.ductwork} />
            <Row label="Max false ceiling drop" value={form.ac?.max_false_ceiling_drop && form.ac.max_false_ceiling_drop + ' cm'} />
            <Row label="Air outlet types" value={form.ac?.air_outlet_types} />
            <Row label="Bathroom branch" value={form.ac?.bathroom_branch} />
            <Row label="Existing heating" value={form.ac?.existing_heating} />
          </Section>
        )}
        {form.form_type === 'Heating' && (
          <Section title="Heating specifics" dense>
            <Row label="Radiators" value={form.heating?.radiators} />
            <Row label="Underfloor" value={form.heating?.underfloor} />
            <Row label="Plumbing" value={form.heating?.plumbing} />
            <Row label="Pipe type (radiators)" value={form.heating?.pipe_type?.radiators} />
            <Row label="Pipe type (underfloor)" value={form.heating?.pipe_type?.underfloor} />
            <Row label="Pipe type (plumbing)" value={form.heating?.pipe_type?.plumbing} />
            <Row label="Radiator floors" value={form.heating?.radiator?.floors} />
            <Row label="Radiator height" value={form.heating?.radiator?.height} />
            <Row label="Towel rails" value={form.heating?.radiator?.towel_rails + (form.heating?.radiator?.towel_other ? ' — ' + form.heating.radiator.towel_other : '')} />
            <Row label="Underfloor floors" value={form.heating?.underfloor_floors} />
            <Row label="Main lines" value={form.heating?.main_lines} />
            <Row label="Heat source" value={`${form.heating?.heat_source?.kind || '-'}${form.heating?.heat_source?.count ? ' × ' + form.heating.heat_source.count : ''}${form.heating?.heat_source?.serves ? ' — ' + form.heating.heat_source.serves : ''}`} />
            {form.heating?.pool?.present && form.heating.pool.present !== 'No' && (
              <Row label="Pool" value={
                `${form.heating.pool.present} · ${form.heating.pool.length || '?'}m × ${form.heating.pool.width || '?'}m × ${form.heating.pool.depth || '?'}m avg, ${form.heating.pool.temperature || '?'}°C, ${form.heating.pool.users || '?'} users · source: ${form.heating.pool.source || '?'}`
              } />
            )}
            {form.heating?.solar?.present && (
              <Row label="Solar" value={`${form.heating.solar.location || '?'}, roof: ${form.heating.solar.roof_type || '?'}, ${form.heating.solar.area || '?'} m² · vert ${form.heating.solar.vertical_distance || '?'}m / horiz ${form.heating.solar.horizontal_distance || '?'}m`} />
            )}
            <Row label="Boiler room" value={form.heating?.boiler_room_location} />
            <Row label="Cylinders" value={form.heating?.cylinders?.kind && `${form.heating.cylinders.kind}${form.heating.cylinders.count ? ' × ' + form.heating.cylinders.count : ''}`} />
            <Row label="Pumps" value={Object.entries(form.heating?.pumps || {}).filter(([, v]) => v).map(([k]) => k).join(', ')} />
            <Row label="Optional accessories" value={Object.entries(form.heating?.accessories || {}).filter(([, v]) => v).map(([k]) => k.replace('_',' ')).join(', ')} />
          </Section>
        )}
      </div>
    );
  }

  // Replace the old simple modal so existing call sites continue to work unchanged.
  window.RequestDesignModal = DesignRequestForm;
  window.DesignRequestForm = DesignRequestForm;
  window.DesignRequestSummary = DesignRequestSummary;
})();
