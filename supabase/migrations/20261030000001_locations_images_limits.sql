-- Locations: complete Nigerian states + FCT and all 774 Local Government Areas, plus Ghana's 16 regions.
--
-- Model: countries -> regions (first-level division: state / region / county / province) -> areas (second level, e.g.
-- Nigerian LGAs). Areas are optional per country: countries.area_label names the level ('LGA') and is null where we
-- do not hold second-level data yet (Ghana, Kenya, South Africa), so those markets keep working exactly as before.
-- Adding districts for another country later is a data migration into public.areas plus setting area_label.
--
-- Existing region rows keep their ids, so listings, profiles and storefronts that already reference them are untouched.
-- LGA source: INEC's list of 774 LGAs (via the MIT-licensed nigeria-inec-geo package); spellings normalised to common
-- usage in supabase/data/ng-locations.json (e.g. "Abuja Municipal", "Ibeju-Lekki"). tests/unit/locations.test.ts checks
-- every state's LGA count against the constitutional figures.

alter table public.countries add column area_label text check (area_label is null or char_length(area_label) between 2 and 40);
update public.countries set area_label = 'LGA' where code = 'NG';

-- (id, country_code) is unique already (id is the key); this lets areas reference both so an area can never point at
-- a region in a different country.
alter table public.regions add constraint regions_id_country_key unique (id, country_code);

-- ---------------------------------------------------------------------------
-- Remaining Nigerian states (approximate state-capital coordinates, used for "distance from state centre").
-- ---------------------------------------------------------------------------
insert into public.regions (country_code, name, kind, latitude, longitude) values
  ('NG', 'Abia', 'state', 5.525000, 7.494300),
  ('NG', 'Adamawa', 'state', 9.203500, 12.495400),
  ('NG', 'Akwa Ibom', 'state', 5.037700, 7.912800),
  ('NG', 'Bauchi', 'state', 10.315800, 9.844200),
  ('NG', 'Bayelsa', 'state', 4.926700, 6.267600),
  ('NG', 'Benue', 'state', 7.732200, 8.539100),
  ('NG', 'Borno', 'state', 11.831100, 13.151000),
  ('NG', 'Cross River', 'state', 4.975700, 8.341700),
  ('NG', 'Delta', 'state', 6.198000, 6.731900),
  ('NG', 'Ebonyi', 'state', 6.324900, 8.113700),
  ('NG', 'Ekiti', 'state', 7.623300, 5.220900),
  ('NG', 'Gombe', 'state', 10.289700, 11.167300),
  ('NG', 'Imo', 'state', 5.483600, 7.033300),
  ('NG', 'Jigawa', 'state', 11.756200, 9.338900),
  ('NG', 'Katsina', 'state', 12.990800, 7.601800),
  ('NG', 'Kebbi', 'state', 12.453900, 4.197500),
  ('NG', 'Kogi', 'state', 7.802300, 6.733300),
  ('NG', 'Kwara', 'state', 8.496600, 4.542100),
  ('NG', 'Nasarawa', 'state', 8.493900, 8.515300),
  ('NG', 'Niger', 'state', 9.613900, 6.556900),
  ('NG', 'Ondo', 'state', 7.257100, 5.205800),
  ('NG', 'Osun', 'state', 7.782700, 4.541800),
  ('NG', 'Plateau', 'state', 9.896500, 8.858300),
  ('NG', 'Sokoto', 'state', 13.005900, 5.247600),
  ('NG', 'Taraba', 'state', 8.893700, 11.359600),
  ('NG', 'Yobe', 'state', 11.747000, 11.960800),
  ('NG', 'Zamfara', 'state', 12.170400, 6.664100)
on conflict (country_code, name) do nothing;

-- Ghana has had 16 regions since 2019; the original seed only had four.
insert into public.regions (country_code, name, kind, latitude, longitude) values
  ('GH', 'Central', 'region', 5.105300, -1.246600),
  ('GH', 'Eastern', 'region', 6.094100, -0.259100),
  ('GH', 'Volta', 'region', 6.600800, 0.471300),
  ('GH', 'Upper East', 'region', 10.785600, -0.851400),
  ('GH', 'Upper West', 'region', 10.060100, -2.509900),
  ('GH', 'Bono', 'region', 7.334900, -2.312300),
  ('GH', 'Bono East', 'region', 7.586200, -1.937800),
  ('GH', 'Ahafo', 'region', 6.803600, -2.517200),
  ('GH', 'Western North', 'region', 6.205800, -2.489400),
  ('GH', 'Oti', 'region', 8.066700, 0.183300),
  ('GH', 'Savannah', 'region', 9.083300, -1.816700),
  ('GH', 'North East', 'region', 10.527500, -0.368300)
on conflict (country_code, name) do nothing;

-- ---------------------------------------------------------------------------
-- Second-level divisions
-- ---------------------------------------------------------------------------
create table public.areas (
  id bigint generated always as identity primary key,
  region_id bigint not null,
  country_code char(2) not null references public.countries(code) on update cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null default 'lga',
  is_active boolean not null default true,
  foreign key (region_id, country_code) references public.regions(id, country_code) on update cascade,
  unique (region_id, name),
  unique (region_id, slug)
);
create index areas_country_idx on public.areas(country_code);

alter table public.areas enable row level security;
create policy areas_read on public.areas for select using (true);
revoke insert, update, delete, truncate on public.areas from anon, authenticated;
grant select on public.areas to anon, authenticated;

insert into public.areas (region_id, country_code, name, slug, kind)
select r.id, 'NG', v.name, v.slug, 'lga'
from (values
  ('Abia', 'Aba North', 'aba-north'),
  ('Abia', 'Aba South', 'aba-south'),
  ('Abia', 'Arochukwu', 'arochukwu'),
  ('Abia', 'Bende', 'bende'),
  ('Abia', 'Ikwuano', 'ikwuano'),
  ('Abia', 'Isiala Ngwa North', 'isiala-ngwa-north'),
  ('Abia', 'Isiala Ngwa South', 'isiala-ngwa-south'),
  ('Abia', 'Isuikwuato', 'isuikwuato'),
  ('Abia', 'Obingwa', 'obingwa'),
  ('Abia', 'Ohafia', 'ohafia'),
  ('Abia', 'Osisioma', 'osisioma'),
  ('Abia', 'Ugwunagbo', 'ugwunagbo'),
  ('Abia', 'Ukwa East', 'ukwa-east'),
  ('Abia', 'Ukwa West', 'ukwa-west'),
  ('Abia', 'Umu Nneochi', 'umu-nneochi'),
  ('Abia', 'Umuahia North', 'umuahia-north'),
  ('Abia', 'Umuahia South', 'umuahia-south'),
  ('Adamawa', 'Demsa', 'demsa'),
  ('Adamawa', 'Fufore', 'fufore'),
  ('Adamawa', 'Ganye', 'ganye'),
  ('Adamawa', 'Girei', 'girei'),
  ('Adamawa', 'Gombi', 'gombi'),
  ('Adamawa', 'Guyuk', 'guyuk'),
  ('Adamawa', 'Hong', 'hong'),
  ('Adamawa', 'Jada', 'jada'),
  ('Adamawa', 'Lamurde', 'lamurde'),
  ('Adamawa', 'Madagali', 'madagali'),
  ('Adamawa', 'Maiha', 'maiha'),
  ('Adamawa', 'Mayo-Belwa', 'mayo-belwa'),
  ('Adamawa', 'Michika', 'michika'),
  ('Adamawa', 'Mubi North', 'mubi-north'),
  ('Adamawa', 'Mubi South', 'mubi-south'),
  ('Adamawa', 'Numan', 'numan'),
  ('Adamawa', 'Shelleng', 'shelleng'),
  ('Adamawa', 'Song', 'song'),
  ('Adamawa', 'Toungo', 'toungo'),
  ('Adamawa', 'Yola North', 'yola-north'),
  ('Adamawa', 'Yola South', 'yola-south'),
  ('Akwa Ibom', 'Abak', 'abak'),
  ('Akwa Ibom', 'Eastern Obolo', 'eastern-obolo'),
  ('Akwa Ibom', 'Eket', 'eket'),
  ('Akwa Ibom', 'Esit Eket', 'esit-eket'),
  ('Akwa Ibom', 'Essien Udim', 'essien-udim'),
  ('Akwa Ibom', 'Etim Ekpo', 'etim-ekpo'),
  ('Akwa Ibom', 'Etinan', 'etinan'),
  ('Akwa Ibom', 'Ibeno', 'ibeno'),
  ('Akwa Ibom', 'Ibesikpo Asutan', 'ibesikpo-asutan'),
  ('Akwa Ibom', 'Ibiono Ibom', 'ibiono-ibom'),
  ('Akwa Ibom', 'Ika', 'ika'),
  ('Akwa Ibom', 'Ikono', 'ikono'),
  ('Akwa Ibom', 'Ikot Abasi', 'ikot-abasi'),
  ('Akwa Ibom', 'Ikot Ekpene', 'ikot-ekpene'),
  ('Akwa Ibom', 'Ini', 'ini'),
  ('Akwa Ibom', 'Itu', 'itu'),
  ('Akwa Ibom', 'Mbo', 'mbo'),
  ('Akwa Ibom', 'Mkpat Enin', 'mkpat-enin'),
  ('Akwa Ibom', 'Nsit Atai', 'nsit-atai'),
  ('Akwa Ibom', 'Nsit Ibom', 'nsit-ibom'),
  ('Akwa Ibom', 'Nsit Ubium', 'nsit-ubium'),
  ('Akwa Ibom', 'Obot Akara', 'obot-akara'),
  ('Akwa Ibom', 'Okobo', 'okobo'),
  ('Akwa Ibom', 'Onna', 'onna'),
  ('Akwa Ibom', 'Oron', 'oron'),
  ('Akwa Ibom', 'Oruk Anam', 'oruk-anam'),
  ('Akwa Ibom', 'Udung Uko', 'udung-uko'),
  ('Akwa Ibom', 'Ukanafun', 'ukanafun'),
  ('Akwa Ibom', 'Uruan', 'uruan'),
  ('Akwa Ibom', 'Urue Offong/Oruko', 'urue-offong-oruko'),
  ('Akwa Ibom', 'Uyo', 'uyo'),
  ('Anambra', 'Aguata', 'aguata'),
  ('Anambra', 'Anambra East', 'anambra-east'),
  ('Anambra', 'Anambra West', 'anambra-west'),
  ('Anambra', 'Anaocha', 'anaocha'),
  ('Anambra', 'Awka North', 'awka-north'),
  ('Anambra', 'Awka South', 'awka-south'),
  ('Anambra', 'Ayamelum', 'ayamelum'),
  ('Anambra', 'Dunukofia', 'dunukofia'),
  ('Anambra', 'Ekwusigo', 'ekwusigo'),
  ('Anambra', 'Idemili North', 'idemili-north'),
  ('Anambra', 'Idemili South', 'idemili-south'),
  ('Anambra', 'Ihiala', 'ihiala'),
  ('Anambra', 'Njikoka', 'njikoka'),
  ('Anambra', 'Nnewi North', 'nnewi-north'),
  ('Anambra', 'Nnewi South', 'nnewi-south'),
  ('Anambra', 'Ogbaru', 'ogbaru'),
  ('Anambra', 'Onitsha North', 'onitsha-north'),
  ('Anambra', 'Onitsha South', 'onitsha-south'),
  ('Anambra', 'Orumba North', 'orumba-north'),
  ('Anambra', 'Orumba South', 'orumba-south'),
  ('Anambra', 'Oyi', 'oyi'),
  ('Bauchi', 'Alkaleri', 'alkaleri'),
  ('Bauchi', 'Bauchi', 'bauchi'),
  ('Bauchi', 'Bogoro', 'bogoro'),
  ('Bauchi', 'Dambam', 'dambam'),
  ('Bauchi', 'Darazo', 'darazo'),
  ('Bauchi', 'Dass', 'dass'),
  ('Bauchi', 'Gamawa', 'gamawa'),
  ('Bauchi', 'Ganjuwa', 'ganjuwa'),
  ('Bauchi', 'Giade', 'giade'),
  ('Bauchi', 'Itas/Gadau', 'itas-gadau'),
  ('Bauchi', 'Jama''are', 'jama-are'),
  ('Bauchi', 'Katagum', 'katagum'),
  ('Bauchi', 'Kirfi', 'kirfi'),
  ('Bauchi', 'Misau', 'misau'),
  ('Bauchi', 'Ningi', 'ningi'),
  ('Bauchi', 'Shira', 'shira'),
  ('Bauchi', 'Tafawa Balewa', 'tafawa-balewa'),
  ('Bauchi', 'Toro', 'toro'),
  ('Bauchi', 'Warji', 'warji'),
  ('Bauchi', 'Zaki', 'zaki'),
  ('Bayelsa', 'Brass', 'brass'),
  ('Bayelsa', 'Ekeremor', 'ekeremor'),
  ('Bayelsa', 'Kolokuma/Opokuma', 'kolokuma-opokuma'),
  ('Bayelsa', 'Nembe', 'nembe'),
  ('Bayelsa', 'Ogbia', 'ogbia'),
  ('Bayelsa', 'Sagbama', 'sagbama'),
  ('Bayelsa', 'Southern Ijaw', 'southern-ijaw'),
  ('Bayelsa', 'Yenagoa', 'yenagoa'),
  ('Benue', 'Ado', 'ado'),
  ('Benue', 'Agatu', 'agatu'),
  ('Benue', 'Apa', 'apa'),
  ('Benue', 'Buruku', 'buruku'),
  ('Benue', 'Gboko', 'gboko'),
  ('Benue', 'Guma', 'guma'),
  ('Benue', 'Gwer East', 'gwer-east'),
  ('Benue', 'Gwer West', 'gwer-west'),
  ('Benue', 'Katsina-Ala', 'katsina-ala'),
  ('Benue', 'Konshisha', 'konshisha'),
  ('Benue', 'Kwande', 'kwande'),
  ('Benue', 'Logo', 'logo'),
  ('Benue', 'Makurdi', 'makurdi'),
  ('Benue', 'Obi', 'obi'),
  ('Benue', 'Ogbadibo', 'ogbadibo'),
  ('Benue', 'Ohimini', 'ohimini'),
  ('Benue', 'Oju', 'oju'),
  ('Benue', 'Okpokwu', 'okpokwu'),
  ('Benue', 'Otukpo', 'otukpo'),
  ('Benue', 'Tarka', 'tarka'),
  ('Benue', 'Ukum', 'ukum'),
  ('Benue', 'Ushongo', 'ushongo'),
  ('Benue', 'Vandeikya', 'vandeikya'),
  ('Borno', 'Abadam', 'abadam'),
  ('Borno', 'Askira/Uba', 'askira-uba'),
  ('Borno', 'Bama', 'bama'),
  ('Borno', 'Bayo', 'bayo'),
  ('Borno', 'Biu', 'biu'),
  ('Borno', 'Chibok', 'chibok'),
  ('Borno', 'Damboa', 'damboa'),
  ('Borno', 'Dikwa', 'dikwa'),
  ('Borno', 'Gubio', 'gubio'),
  ('Borno', 'Guzamala', 'guzamala'),
  ('Borno', 'Gwoza', 'gwoza'),
  ('Borno', 'Hawul', 'hawul'),
  ('Borno', 'Jere', 'jere'),
  ('Borno', 'Kaga', 'kaga'),
  ('Borno', 'Kala Balge', 'kala-balge'),
  ('Borno', 'Konduga', 'konduga'),
  ('Borno', 'Kukawa', 'kukawa'),
  ('Borno', 'Kwaya/Kusar', 'kwaya-kusar'),
  ('Borno', 'Mafa', 'mafa'),
  ('Borno', 'Magumeri', 'magumeri'),
  ('Borno', 'Maiduguri', 'maiduguri'),
  ('Borno', 'Marte', 'marte'),
  ('Borno', 'Mobbar', 'mobbar'),
  ('Borno', 'Monguno', 'monguno'),
  ('Borno', 'Ngala', 'ngala'),
  ('Borno', 'Nganzai', 'nganzai'),
  ('Borno', 'Shani', 'shani'),
  ('Cross River', 'Abi', 'abi'),
  ('Cross River', 'Akamkpa', 'akamkpa'),
  ('Cross River', 'Akpabuyo', 'akpabuyo'),
  ('Cross River', 'Bakassi', 'bakassi'),
  ('Cross River', 'Bekwarra', 'bekwarra'),
  ('Cross River', 'Biase', 'biase'),
  ('Cross River', 'Boki', 'boki'),
  ('Cross River', 'Calabar Municipal', 'calabar-municipal'),
  ('Cross River', 'Calabar South', 'calabar-south'),
  ('Cross River', 'Etung', 'etung'),
  ('Cross River', 'Ikom', 'ikom'),
  ('Cross River', 'Obanliku', 'obanliku'),
  ('Cross River', 'Obubra', 'obubra'),
  ('Cross River', 'Obudu', 'obudu'),
  ('Cross River', 'Odukpani', 'odukpani'),
  ('Cross River', 'Ogoja', 'ogoja'),
  ('Cross River', 'Yakurr', 'yakurr'),
  ('Cross River', 'Yala', 'yala'),
  ('Delta', 'Aniocha North', 'aniocha-north'),
  ('Delta', 'Aniocha South', 'aniocha-south'),
  ('Delta', 'Bomadi', 'bomadi'),
  ('Delta', 'Burutu', 'burutu'),
  ('Delta', 'Ethiope East', 'ethiope-east'),
  ('Delta', 'Ethiope West', 'ethiope-west'),
  ('Delta', 'Ika North-East', 'ika-north-east'),
  ('Delta', 'Ika South', 'ika-south'),
  ('Delta', 'Isoko North', 'isoko-north'),
  ('Delta', 'Isoko South', 'isoko-south'),
  ('Delta', 'Ndokwa East', 'ndokwa-east'),
  ('Delta', 'Ndokwa West', 'ndokwa-west'),
  ('Delta', 'Okpe', 'okpe'),
  ('Delta', 'Oshimili North', 'oshimili-north'),
  ('Delta', 'Oshimili South', 'oshimili-south'),
  ('Delta', 'Patani', 'patani'),
  ('Delta', 'Sapele', 'sapele'),
  ('Delta', 'Udu', 'udu'),
  ('Delta', 'Ughelli North', 'ughelli-north'),
  ('Delta', 'Ughelli South', 'ughelli-south'),
  ('Delta', 'Ukwuani', 'ukwuani'),
  ('Delta', 'Uvwie', 'uvwie'),
  ('Delta', 'Warri North', 'warri-north'),
  ('Delta', 'Warri South', 'warri-south'),
  ('Delta', 'Warri South-West', 'warri-south-west'),
  ('Ebonyi', 'Abakaliki', 'abakaliki'),
  ('Ebonyi', 'Afikpo North', 'afikpo-north'),
  ('Ebonyi', 'Afikpo South', 'afikpo-south'),
  ('Ebonyi', 'Ebonyi', 'ebonyi'),
  ('Ebonyi', 'Ezza North', 'ezza-north'),
  ('Ebonyi', 'Ezza South', 'ezza-south'),
  ('Ebonyi', 'Ikwo', 'ikwo'),
  ('Ebonyi', 'Ishielu', 'ishielu'),
  ('Ebonyi', 'Ivo', 'ivo'),
  ('Ebonyi', 'Izzi', 'izzi'),
  ('Ebonyi', 'Ohaozara', 'ohaozara'),
  ('Ebonyi', 'Ohaukwu', 'ohaukwu'),
  ('Ebonyi', 'Onicha', 'onicha'),
  ('Edo', 'Akoko Edo', 'akoko-edo'),
  ('Edo', 'Egor', 'egor'),
  ('Edo', 'Esan Central', 'esan-central'),
  ('Edo', 'Esan North-East', 'esan-north-east'),
  ('Edo', 'Esan South-East', 'esan-south-east'),
  ('Edo', 'Esan West', 'esan-west'),
  ('Edo', 'Etsako Central', 'etsako-central'),
  ('Edo', 'Etsako East', 'etsako-east'),
  ('Edo', 'Etsako West', 'etsako-west'),
  ('Edo', 'Igueben', 'igueben'),
  ('Edo', 'Ikpoba/Okha', 'ikpoba-okha'),
  ('Edo', 'Oredo', 'oredo'),
  ('Edo', 'Orhionmwon', 'orhionmwon'),
  ('Edo', 'Ovia North-East', 'ovia-north-east'),
  ('Edo', 'Ovia South-West', 'ovia-south-west'),
  ('Edo', 'Owan East', 'owan-east'),
  ('Edo', 'Owan West', 'owan-west'),
  ('Edo', 'Uhunmwonde', 'uhunmwonde'),
  ('Ekiti', 'Ado Ekiti', 'ado-ekiti'),
  ('Ekiti', 'Efon', 'efon'),
  ('Ekiti', 'Ekiti East', 'ekiti-east'),
  ('Ekiti', 'Ekiti South-West', 'ekiti-south-west'),
  ('Ekiti', 'Ekiti West', 'ekiti-west'),
  ('Ekiti', 'Emure', 'emure'),
  ('Ekiti', 'Gbonyin', 'gbonyin'),
  ('Ekiti', 'Ido/Osi', 'ido-osi'),
  ('Ekiti', 'Ijero', 'ijero'),
  ('Ekiti', 'Ikere', 'ikere'),
  ('Ekiti', 'Ikole', 'ikole'),
  ('Ekiti', 'Ilejemeje', 'ilejemeje'),
  ('Ekiti', 'Irepodun/Ifelodun', 'irepodun-ifelodun'),
  ('Ekiti', 'Ise/Orun', 'ise-orun'),
  ('Ekiti', 'Moba', 'moba'),
  ('Ekiti', 'Oye', 'oye'),
  ('Enugu', 'Aninri', 'aninri'),
  ('Enugu', 'Awgu', 'awgu'),
  ('Enugu', 'Enugu East', 'enugu-east'),
  ('Enugu', 'Enugu North', 'enugu-north'),
  ('Enugu', 'Enugu South', 'enugu-south'),
  ('Enugu', 'Ezeagu', 'ezeagu'),
  ('Enugu', 'Igbo Etiti', 'igbo-etiti'),
  ('Enugu', 'Igbo Eze North', 'igbo-eze-north'),
  ('Enugu', 'Igbo Eze South', 'igbo-eze-south'),
  ('Enugu', 'Isi Uzo', 'isi-uzo'),
  ('Enugu', 'Nkanu East', 'nkanu-east'),
  ('Enugu', 'Nkanu West', 'nkanu-west'),
  ('Enugu', 'Nsukka', 'nsukka'),
  ('Enugu', 'Oji River', 'oji-river'),
  ('Enugu', 'Udenu', 'udenu'),
  ('Enugu', 'Udi', 'udi'),
  ('Enugu', 'Uzo-Uwani', 'uzo-uwani'),
  ('Federal Capital Territory', 'Abaji', 'abaji'),
  ('Federal Capital Territory', 'Abuja Municipal', 'abuja-municipal'),
  ('Federal Capital Territory', 'Bwari', 'bwari'),
  ('Federal Capital Territory', 'Gwagwalada', 'gwagwalada'),
  ('Federal Capital Territory', 'Kuje', 'kuje'),
  ('Federal Capital Territory', 'Kwali', 'kwali'),
  ('Gombe', 'Akko', 'akko'),
  ('Gombe', 'Balanga', 'balanga'),
  ('Gombe', 'Billiri', 'billiri'),
  ('Gombe', 'Dukku', 'dukku'),
  ('Gombe', 'Funakaye', 'funakaye'),
  ('Gombe', 'Gombe', 'gombe'),
  ('Gombe', 'Kaltungo', 'kaltungo'),
  ('Gombe', 'Kwami', 'kwami'),
  ('Gombe', 'Nafada', 'nafada'),
  ('Gombe', 'Shongom', 'shongom'),
  ('Gombe', 'Yamaltu/Deba', 'yamaltu-deba'),
  ('Imo', 'Aboh Mbaise', 'aboh-mbaise'),
  ('Imo', 'Ahiazu Mbaise', 'ahiazu-mbaise'),
  ('Imo', 'Ehime Mbano', 'ehime-mbano'),
  ('Imo', 'Ezinihitte Mbaise', 'ezinihitte-mbaise'),
  ('Imo', 'Ideato North', 'ideato-north'),
  ('Imo', 'Ideato South', 'ideato-south'),
  ('Imo', 'Ihitte Uboma', 'ihitte-uboma'),
  ('Imo', 'Ikeduru', 'ikeduru'),
  ('Imo', 'Isiala Mbano', 'isiala-mbano'),
  ('Imo', 'Isu', 'isu'),
  ('Imo', 'Mbaitoli', 'mbaitoli'),
  ('Imo', 'Ngor Okpala', 'ngor-okpala'),
  ('Imo', 'Njaba', 'njaba'),
  ('Imo', 'Nkwerre', 'nkwerre'),
  ('Imo', 'Nwangele', 'nwangele'),
  ('Imo', 'Obowo', 'obowo'),
  ('Imo', 'Oguta', 'oguta'),
  ('Imo', 'Ohaji Egbema', 'ohaji-egbema'),
  ('Imo', 'Okigwe', 'okigwe'),
  ('Imo', 'Onuimo', 'onuimo'),
  ('Imo', 'Orlu', 'orlu'),
  ('Imo', 'Orsu', 'orsu'),
  ('Imo', 'Oru East', 'oru-east'),
  ('Imo', 'Oru West', 'oru-west'),
  ('Imo', 'Owerri Municipal', 'owerri-municipal'),
  ('Imo', 'Owerri North', 'owerri-north'),
  ('Imo', 'Owerri West', 'owerri-west'),
  ('Jigawa', 'Auyo', 'auyo'),
  ('Jigawa', 'Babura', 'babura'),
  ('Jigawa', 'Birnin Kudu', 'birnin-kudu'),
  ('Jigawa', 'Birniwa', 'birniwa'),
  ('Jigawa', 'Buji', 'buji'),
  ('Jigawa', 'Dutse', 'dutse'),
  ('Jigawa', 'Gagarawa', 'gagarawa'),
  ('Jigawa', 'Garki', 'garki'),
  ('Jigawa', 'Gumel', 'gumel'),
  ('Jigawa', 'Guri', 'guri'),
  ('Jigawa', 'Gwaram', 'gwaram'),
  ('Jigawa', 'Gwiwa', 'gwiwa'),
  ('Jigawa', 'Hadejia', 'hadejia'),
  ('Jigawa', 'Jahun', 'jahun'),
  ('Jigawa', 'Kafin Hausa', 'kafin-hausa'),
  ('Jigawa', 'Kaugama', 'kaugama'),
  ('Jigawa', 'Kazaure', 'kazaure'),
  ('Jigawa', 'Kirika Samma', 'kirika-samma'),
  ('Jigawa', 'Kiyawa', 'kiyawa'),
  ('Jigawa', 'Maigatari', 'maigatari'),
  ('Jigawa', 'Malam Madori', 'malam-madori'),
  ('Jigawa', 'Miga', 'miga'),
  ('Jigawa', 'Ringim', 'ringim'),
  ('Jigawa', 'Roni', 'roni'),
  ('Jigawa', 'Sule-Tankarkar', 'sule-tankarkar'),
  ('Jigawa', 'Taura', 'taura'),
  ('Jigawa', 'Yankwashi', 'yankwashi'),
  ('Kaduna', 'Birnin Gwari', 'birnin-gwari'),
  ('Kaduna', 'Chikun', 'chikun'),
  ('Kaduna', 'Giwa', 'giwa'),
  ('Kaduna', 'Igabi', 'igabi'),
  ('Kaduna', 'Ikara', 'ikara'),
  ('Kaduna', 'Jaba', 'jaba'),
  ('Kaduna', 'Jema''a', 'jema-a'),
  ('Kaduna', 'Kachia', 'kachia'),
  ('Kaduna', 'Kaduna North', 'kaduna-north'),
  ('Kaduna', 'Kaduna South', 'kaduna-south'),
  ('Kaduna', 'Kagarko', 'kagarko'),
  ('Kaduna', 'Kajuru', 'kajuru'),
  ('Kaduna', 'Kaura', 'kaura'),
  ('Kaduna', 'Kauru', 'kauru'),
  ('Kaduna', 'Kubau', 'kubau'),
  ('Kaduna', 'Kudan', 'kudan'),
  ('Kaduna', 'Lere', 'lere'),
  ('Kaduna', 'Makarfi', 'makarfi'),
  ('Kaduna', 'Sabon Gari', 'sabon-gari'),
  ('Kaduna', 'Sanga', 'sanga'),
  ('Kaduna', 'Soba', 'soba'),
  ('Kaduna', 'Zangon Kataf', 'zangon-kataf'),
  ('Kaduna', 'Zaria', 'zaria'),
  ('Kano', 'Ajingi', 'ajingi'),
  ('Kano', 'Albasu', 'albasu'),
  ('Kano', 'Bagwai', 'bagwai'),
  ('Kano', 'Bebeji', 'bebeji'),
  ('Kano', 'Bichi', 'bichi'),
  ('Kano', 'Bunkure', 'bunkure'),
  ('Kano', 'Dala', 'dala'),
  ('Kano', 'Dambatta', 'dambatta'),
  ('Kano', 'Dawakin Kudu', 'dawakin-kudu'),
  ('Kano', 'Dawakin Tofa', 'dawakin-tofa'),
  ('Kano', 'Doguwa', 'doguwa'),
  ('Kano', 'Fagge', 'fagge'),
  ('Kano', 'Gabasawa', 'gabasawa'),
  ('Kano', 'Garko', 'garko'),
  ('Kano', 'Garun Mallam', 'garun-mallam'),
  ('Kano', 'Gaya', 'gaya'),
  ('Kano', 'Gezawa', 'gezawa'),
  ('Kano', 'Gwale', 'gwale'),
  ('Kano', 'Gwarzo', 'gwarzo'),
  ('Kano', 'Kabo', 'kabo'),
  ('Kano', 'Kano Municipal', 'kano-municipal'),
  ('Kano', 'Karaye', 'karaye'),
  ('Kano', 'Kibiya', 'kibiya'),
  ('Kano', 'Kiru', 'kiru'),
  ('Kano', 'Kumbotso', 'kumbotso'),
  ('Kano', 'Kunchi', 'kunchi'),
  ('Kano', 'Kura', 'kura'),
  ('Kano', 'Madobi', 'madobi'),
  ('Kano', 'Makoda', 'makoda'),
  ('Kano', 'Minjibir', 'minjibir'),
  ('Kano', 'Nasarawa', 'nasarawa'),
  ('Kano', 'Rano', 'rano'),
  ('Kano', 'Rimin Gado', 'rimin-gado'),
  ('Kano', 'Rogo', 'rogo'),
  ('Kano', 'Shanono', 'shanono'),
  ('Kano', 'Sumaila', 'sumaila'),
  ('Kano', 'Takai', 'takai'),
  ('Kano', 'Tarauni', 'tarauni'),
  ('Kano', 'Tofa', 'tofa'),
  ('Kano', 'Tsanyawa', 'tsanyawa'),
  ('Kano', 'Tudun Wada', 'tudun-wada'),
  ('Kano', 'Ungogo', 'ungogo'),
  ('Kano', 'Warawa', 'warawa'),
  ('Kano', 'Wudil', 'wudil'),
  ('Katsina', 'Bakori', 'bakori'),
  ('Katsina', 'Batagarawa', 'batagarawa'),
  ('Katsina', 'Batsari', 'batsari'),
  ('Katsina', 'Baure', 'baure'),
  ('Katsina', 'Bindawa', 'bindawa'),
  ('Katsina', 'Charanchi', 'charanchi'),
  ('Katsina', 'Dan Musa', 'dan-musa'),
  ('Katsina', 'Dandume', 'dandume'),
  ('Katsina', 'Danja', 'danja'),
  ('Katsina', 'Daura', 'daura'),
  ('Katsina', 'Dutsi', 'dutsi'),
  ('Katsina', 'Dutsin-Ma', 'dutsin-ma'),
  ('Katsina', 'Faskari', 'faskari'),
  ('Katsina', 'Funtua', 'funtua'),
  ('Katsina', 'Ingawa', 'ingawa'),
  ('Katsina', 'Jibia', 'jibia'),
  ('Katsina', 'Kafur', 'kafur'),
  ('Katsina', 'Kaita', 'kaita'),
  ('Katsina', 'Kankara', 'kankara'),
  ('Katsina', 'Kankia', 'kankia'),
  ('Katsina', 'Katsina', 'katsina'),
  ('Katsina', 'Kurfi', 'kurfi'),
  ('Katsina', 'Kusada', 'kusada'),
  ('Katsina', 'Mai''adua', 'mai-adua'),
  ('Katsina', 'Malumfashi', 'malumfashi'),
  ('Katsina', 'Mani', 'mani'),
  ('Katsina', 'Mashi', 'mashi'),
  ('Katsina', 'Matazu', 'matazu'),
  ('Katsina', 'Musawa', 'musawa'),
  ('Katsina', 'Rimi', 'rimi'),
  ('Katsina', 'Sabuwa', 'sabuwa'),
  ('Katsina', 'Safana', 'safana'),
  ('Katsina', 'Sandamu', 'sandamu'),
  ('Katsina', 'Zango', 'zango'),
  ('Kebbi', 'Aliero', 'aliero'),
  ('Kebbi', 'Arewa Dandi', 'arewa-dandi'),
  ('Kebbi', 'Argungu', 'argungu'),
  ('Kebbi', 'Augie', 'augie'),
  ('Kebbi', 'Bagudo', 'bagudo'),
  ('Kebbi', 'Birnin Kebbi', 'birnin-kebbi'),
  ('Kebbi', 'Bunza', 'bunza'),
  ('Kebbi', 'Dandi', 'dandi'),
  ('Kebbi', 'Fakai', 'fakai'),
  ('Kebbi', 'Gwandu', 'gwandu'),
  ('Kebbi', 'Jega', 'jega'),
  ('Kebbi', 'Kalgo', 'kalgo'),
  ('Kebbi', 'Koko/Besse', 'koko-besse'),
  ('Kebbi', 'Maiyama', 'maiyama'),
  ('Kebbi', 'Ngaski', 'ngaski'),
  ('Kebbi', 'Sakaba', 'sakaba'),
  ('Kebbi', 'Shanga', 'shanga'),
  ('Kebbi', 'Suru', 'suru'),
  ('Kebbi', 'Wasagu/Danko', 'wasagu-danko'),
  ('Kebbi', 'Yauri', 'yauri'),
  ('Kebbi', 'Zuru', 'zuru'),
  ('Kogi', 'Adavi', 'adavi'),
  ('Kogi', 'Ajaokuta', 'ajaokuta'),
  ('Kogi', 'Ankpa', 'ankpa'),
  ('Kogi', 'Bassa', 'bassa'),
  ('Kogi', 'Dekina', 'dekina'),
  ('Kogi', 'Ibaji', 'ibaji'),
  ('Kogi', 'Idah', 'idah'),
  ('Kogi', 'Igalamela/Odolu', 'igalamela-odolu'),
  ('Kogi', 'Ijumu', 'ijumu'),
  ('Kogi', 'Kabba/Bunu', 'kabba-bunu'),
  ('Kogi', 'Kogi (Koton Karfe)', 'kogi-koton-karfe'),
  ('Kogi', 'Lokoja', 'lokoja'),
  ('Kogi', 'Mopa Muro', 'mopa-muro'),
  ('Kogi', 'Ofu', 'ofu'),
  ('Kogi', 'Ogori/Magongo', 'ogori-magongo'),
  ('Kogi', 'Okehi', 'okehi'),
  ('Kogi', 'Okene', 'okene'),
  ('Kogi', 'Olamaboro', 'olamaboro'),
  ('Kogi', 'Omala', 'omala'),
  ('Kogi', 'Yagba East', 'yagba-east'),
  ('Kogi', 'Yagba West', 'yagba-west'),
  ('Kwara', 'Asa', 'asa'),
  ('Kwara', 'Baruten', 'baruten'),
  ('Kwara', 'Edu', 'edu'),
  ('Kwara', 'Ekiti', 'ekiti'),
  ('Kwara', 'Ifelodun', 'ifelodun'),
  ('Kwara', 'Ilorin East', 'ilorin-east'),
  ('Kwara', 'Ilorin South', 'ilorin-south'),
  ('Kwara', 'Ilorin West', 'ilorin-west'),
  ('Kwara', 'Irepodun', 'irepodun'),
  ('Kwara', 'Isin', 'isin'),
  ('Kwara', 'Kaiama', 'kaiama'),
  ('Kwara', 'Moro', 'moro'),
  ('Kwara', 'Offa', 'offa'),
  ('Kwara', 'Oke-Ero', 'oke-ero'),
  ('Kwara', 'Oyun', 'oyun'),
  ('Kwara', 'Pategi', 'pategi'),
  ('Lagos', 'Agege', 'agege'),
  ('Lagos', 'Ajeromi/Ifelodun', 'ajeromi-ifelodun'),
  ('Lagos', 'Alimosho', 'alimosho'),
  ('Lagos', 'Amuwo-Odofin', 'amuwo-odofin'),
  ('Lagos', 'Apapa', 'apapa'),
  ('Lagos', 'Badagry', 'badagry'),
  ('Lagos', 'Epe', 'epe'),
  ('Lagos', 'Eti-Osa', 'eti-osa'),
  ('Lagos', 'Ibeju-Lekki', 'ibeju-lekki'),
  ('Lagos', 'Ifako-Ijaye', 'ifako-ijaye'),
  ('Lagos', 'Ikeja', 'ikeja'),
  ('Lagos', 'Ikorodu', 'ikorodu'),
  ('Lagos', 'Kosofe', 'kosofe'),
  ('Lagos', 'Lagos Island', 'lagos-island'),
  ('Lagos', 'Lagos Mainland', 'lagos-mainland'),
  ('Lagos', 'Mushin', 'mushin'),
  ('Lagos', 'Ojo', 'ojo'),
  ('Lagos', 'Oshodi/Isolo', 'oshodi-isolo'),
  ('Lagos', 'Shomolu', 'shomolu'),
  ('Lagos', 'Surulere', 'surulere'),
  ('Nasarawa', 'Akwanga', 'akwanga'),
  ('Nasarawa', 'Awe', 'awe'),
  ('Nasarawa', 'Doma', 'doma'),
  ('Nasarawa', 'Karu', 'karu'),
  ('Nasarawa', 'Keana', 'keana'),
  ('Nasarawa', 'Keffi', 'keffi'),
  ('Nasarawa', 'Kokona', 'kokona'),
  ('Nasarawa', 'Lafia', 'lafia'),
  ('Nasarawa', 'Nasarawa', 'nasarawa'),
  ('Nasarawa', 'Nasarawa Eggon', 'nasarawa-eggon'),
  ('Nasarawa', 'Obi', 'obi'),
  ('Nasarawa', 'Toto', 'toto'),
  ('Nasarawa', 'Wamba', 'wamba'),
  ('Niger', 'Agaie', 'agaie'),
  ('Niger', 'Agwara', 'agwara'),
  ('Niger', 'Bida', 'bida'),
  ('Niger', 'Borgu', 'borgu'),
  ('Niger', 'Bosso', 'bosso'),
  ('Niger', 'Chanchaga', 'chanchaga'),
  ('Niger', 'Edatti', 'edatti'),
  ('Niger', 'Gbako', 'gbako'),
  ('Niger', 'Gurara', 'gurara'),
  ('Niger', 'Katcha', 'katcha'),
  ('Niger', 'Kontagora', 'kontagora'),
  ('Niger', 'Lapai', 'lapai'),
  ('Niger', 'Lavun', 'lavun'),
  ('Niger', 'Magama', 'magama'),
  ('Niger', 'Mariga', 'mariga'),
  ('Niger', 'Mashegu', 'mashegu'),
  ('Niger', 'Mokwa', 'mokwa'),
  ('Niger', 'Munya', 'munya'),
  ('Niger', 'Paikoro', 'paikoro'),
  ('Niger', 'Rafi', 'rafi'),
  ('Niger', 'Rijau', 'rijau'),
  ('Niger', 'Shiroro', 'shiroro'),
  ('Niger', 'Suleja', 'suleja'),
  ('Niger', 'Tafa', 'tafa'),
  ('Niger', 'Wushishi', 'wushishi'),
  ('Ogun', 'Abeokuta North', 'abeokuta-north'),
  ('Ogun', 'Abeokuta South', 'abeokuta-south'),
  ('Ogun', 'Ado-Odo/Ota', 'ado-odo-ota'),
  ('Ogun', 'Egbado North', 'egbado-north'),
  ('Ogun', 'Egbado South', 'egbado-south'),
  ('Ogun', 'Ewekoro', 'ewekoro'),
  ('Ogun', 'Ifo', 'ifo'),
  ('Ogun', 'Ijebu East', 'ijebu-east'),
  ('Ogun', 'Ijebu North', 'ijebu-north'),
  ('Ogun', 'Ijebu North-East', 'ijebu-north-east'),
  ('Ogun', 'Ijebu Ode', 'ijebu-ode'),
  ('Ogun', 'Ikenne', 'ikenne'),
  ('Ogun', 'Imeko/Afon', 'imeko-afon'),
  ('Ogun', 'Ipokia', 'ipokia'),
  ('Ogun', 'Obafemi/Owode', 'obafemi-owode'),
  ('Ogun', 'Odeda', 'odeda'),
  ('Ogun', 'Odogbolu', 'odogbolu'),
  ('Ogun', 'Ogun Water Side', 'ogun-water-side'),
  ('Ogun', 'Remo North', 'remo-north'),
  ('Ogun', 'Sagamu', 'sagamu'),
  ('Ondo', 'Akoko North-East', 'akoko-north-east'),
  ('Ondo', 'Akoko North-West', 'akoko-north-west'),
  ('Ondo', 'Akoko South-East', 'akoko-south-east'),
  ('Ondo', 'Akoko South-West', 'akoko-south-west'),
  ('Ondo', 'Akure North', 'akure-north'),
  ('Ondo', 'Akure South', 'akure-south'),
  ('Ondo', 'Ese-Odo', 'ese-odo'),
  ('Ondo', 'Idanre', 'idanre'),
  ('Ondo', 'Ifedore', 'ifedore'),
  ('Ondo', 'Ilaje', 'ilaje'),
  ('Ondo', 'Ileoluji/Okeigbo', 'ileoluji-okeigbo'),
  ('Ondo', 'Irele', 'irele'),
  ('Ondo', 'Odigbo', 'odigbo'),
  ('Ondo', 'Okitipupa', 'okitipupa'),
  ('Ondo', 'Ondo East', 'ondo-east'),
  ('Ondo', 'Ondo West', 'ondo-west'),
  ('Ondo', 'Ose', 'ose'),
  ('Ondo', 'Owo', 'owo'),
  ('Osun', 'Atakunmosa East', 'atakunmosa-east'),
  ('Osun', 'Atakunmosa West', 'atakunmosa-west'),
  ('Osun', 'Ayedaade', 'ayedaade'),
  ('Osun', 'Ayedire', 'ayedire'),
  ('Osun', 'Boluwaduro', 'boluwaduro'),
  ('Osun', 'Boripe', 'boripe'),
  ('Osun', 'Ede North', 'ede-north'),
  ('Osun', 'Ede South', 'ede-south'),
  ('Osun', 'Egbedore', 'egbedore'),
  ('Osun', 'Ejigbo', 'ejigbo'),
  ('Osun', 'Ife Central', 'ife-central'),
  ('Osun', 'Ife East', 'ife-east'),
  ('Osun', 'Ife North', 'ife-north'),
  ('Osun', 'Ife South', 'ife-south'),
  ('Osun', 'Ifedayo', 'ifedayo'),
  ('Osun', 'Ifelodun', 'ifelodun'),
  ('Osun', 'Ila', 'ila'),
  ('Osun', 'Ilesa East', 'ilesa-east'),
  ('Osun', 'Ilesa West', 'ilesa-west'),
  ('Osun', 'Irepodun', 'irepodun'),
  ('Osun', 'Irewole', 'irewole'),
  ('Osun', 'Isokan', 'isokan'),
  ('Osun', 'Iwo', 'iwo'),
  ('Osun', 'Obokun', 'obokun'),
  ('Osun', 'Odo-Otin', 'odo-otin'),
  ('Osun', 'Ola-Oluwa', 'ola-oluwa'),
  ('Osun', 'Olorunda', 'olorunda'),
  ('Osun', 'Oriade', 'oriade'),
  ('Osun', 'Orolu', 'orolu'),
  ('Osun', 'Osogbo', 'osogbo'),
  ('Oyo', 'Afijio', 'afijio'),
  ('Oyo', 'Akinyele', 'akinyele'),
  ('Oyo', 'Atiba', 'atiba'),
  ('Oyo', 'Atisbo', 'atisbo'),
  ('Oyo', 'Egbeda', 'egbeda'),
  ('Oyo', 'Ibadan North', 'ibadan-north'),
  ('Oyo', 'Ibadan North-East', 'ibadan-north-east'),
  ('Oyo', 'Ibadan North-West', 'ibadan-north-west'),
  ('Oyo', 'Ibadan South-East', 'ibadan-south-east'),
  ('Oyo', 'Ibadan South-West', 'ibadan-south-west'),
  ('Oyo', 'Ibarapa Central', 'ibarapa-central'),
  ('Oyo', 'Ibarapa East', 'ibarapa-east'),
  ('Oyo', 'Ibarapa North', 'ibarapa-north'),
  ('Oyo', 'Ido', 'ido'),
  ('Oyo', 'Irepo', 'irepo'),
  ('Oyo', 'Iseyin', 'iseyin'),
  ('Oyo', 'Itesiwaju', 'itesiwaju'),
  ('Oyo', 'Iwajowa', 'iwajowa'),
  ('Oyo', 'Kajola', 'kajola'),
  ('Oyo', 'Lagelu', 'lagelu'),
  ('Oyo', 'Ogbomoso North', 'ogbomoso-north'),
  ('Oyo', 'Ogbomoso South', 'ogbomoso-south'),
  ('Oyo', 'Ogo-Oluwa', 'ogo-oluwa'),
  ('Oyo', 'Olorunsogo', 'olorunsogo'),
  ('Oyo', 'Oluyole', 'oluyole'),
  ('Oyo', 'Ona-Ara', 'ona-ara'),
  ('Oyo', 'Oorelope', 'oorelope'),
  ('Oyo', 'Ori Ire', 'ori-ire'),
  ('Oyo', 'Oyo East', 'oyo-east'),
  ('Oyo', 'Oyo West', 'oyo-west'),
  ('Oyo', 'Saki East', 'saki-east'),
  ('Oyo', 'Saki West', 'saki-west'),
  ('Oyo', 'Surulere', 'surulere'),
  ('Plateau', 'Barkin Ladi', 'barkin-ladi'),
  ('Plateau', 'Bassa', 'bassa'),
  ('Plateau', 'Bokkos', 'bokkos'),
  ('Plateau', 'Jos East', 'jos-east'),
  ('Plateau', 'Jos North', 'jos-north'),
  ('Plateau', 'Jos South', 'jos-south'),
  ('Plateau', 'Kanam', 'kanam'),
  ('Plateau', 'Kanke', 'kanke'),
  ('Plateau', 'Langtang North', 'langtang-north'),
  ('Plateau', 'Langtang South', 'langtang-south'),
  ('Plateau', 'Mangu', 'mangu'),
  ('Plateau', 'Mikang', 'mikang'),
  ('Plateau', 'Pankshin', 'pankshin'),
  ('Plateau', 'Qua''an Pan', 'qua-an-pan'),
  ('Plateau', 'Riyom', 'riyom'),
  ('Plateau', 'Shendam', 'shendam'),
  ('Plateau', 'Wase', 'wase'),
  ('Rivers', 'Abua-Odual', 'abua-odual'),
  ('Rivers', 'Ahoada East', 'ahoada-east'),
  ('Rivers', 'Ahoada West', 'ahoada-west'),
  ('Rivers', 'Akuku Toru', 'akuku-toru'),
  ('Rivers', 'Andoni', 'andoni'),
  ('Rivers', 'Asari-Toru', 'asari-toru'),
  ('Rivers', 'Bonny', 'bonny'),
  ('Rivers', 'Degema', 'degema'),
  ('Rivers', 'Eleme', 'eleme'),
  ('Rivers', 'Emohua', 'emohua'),
  ('Rivers', 'Etche', 'etche'),
  ('Rivers', 'Gokana', 'gokana'),
  ('Rivers', 'Ikwerre', 'ikwerre'),
  ('Rivers', 'Khana', 'khana'),
  ('Rivers', 'Obio/Akpor', 'obio-akpor'),
  ('Rivers', 'Ogba/Egbema/Ndoni', 'ogba-egbema-ndoni'),
  ('Rivers', 'Ogu/Bolo', 'ogu-bolo'),
  ('Rivers', 'Okrika', 'okrika'),
  ('Rivers', 'Omuma', 'omuma'),
  ('Rivers', 'Opobo/Nkoro', 'opobo-nkoro'),
  ('Rivers', 'Oyigbo', 'oyigbo'),
  ('Rivers', 'Port Harcourt', 'port-harcourt'),
  ('Rivers', 'Tai', 'tai'),
  ('Sokoto', 'Binji', 'binji'),
  ('Sokoto', 'Bodinga', 'bodinga'),
  ('Sokoto', 'Dange/Shuni', 'dange-shuni'),
  ('Sokoto', 'Gada', 'gada'),
  ('Sokoto', 'Goronyo', 'goronyo'),
  ('Sokoto', 'Gudu', 'gudu'),
  ('Sokoto', 'Gwadabawa', 'gwadabawa'),
  ('Sokoto', 'Illela', 'illela'),
  ('Sokoto', 'Isa', 'isa'),
  ('Sokoto', 'Kebbe', 'kebbe'),
  ('Sokoto', 'Kware', 'kware'),
  ('Sokoto', 'Rabah', 'rabah'),
  ('Sokoto', 'Sabon Birni', 'sabon-birni'),
  ('Sokoto', 'Shagari', 'shagari'),
  ('Sokoto', 'Silame', 'silame'),
  ('Sokoto', 'Sokoto North', 'sokoto-north'),
  ('Sokoto', 'Sokoto South', 'sokoto-south'),
  ('Sokoto', 'Tambuwal', 'tambuwal'),
  ('Sokoto', 'Tangaza', 'tangaza'),
  ('Sokoto', 'Tureta', 'tureta'),
  ('Sokoto', 'Wamakko', 'wamakko'),
  ('Sokoto', 'Wurno', 'wurno'),
  ('Sokoto', 'Yabo', 'yabo'),
  ('Taraba', 'Ardo-Kola', 'ardo-kola'),
  ('Taraba', 'Bali', 'bali'),
  ('Taraba', 'Donga', 'donga'),
  ('Taraba', 'Gashaka', 'gashaka'),
  ('Taraba', 'Gassol', 'gassol'),
  ('Taraba', 'Ibi', 'ibi'),
  ('Taraba', 'Jalingo', 'jalingo'),
  ('Taraba', 'Karim-Lamido', 'karim-lamido'),
  ('Taraba', 'Kurmi', 'kurmi'),
  ('Taraba', 'Lau', 'lau'),
  ('Taraba', 'Sardauna', 'sardauna'),
  ('Taraba', 'Takum', 'takum'),
  ('Taraba', 'Ussa', 'ussa'),
  ('Taraba', 'Wukari', 'wukari'),
  ('Taraba', 'Yorro', 'yorro'),
  ('Taraba', 'Zing', 'zing'),
  ('Yobe', 'Bade', 'bade'),
  ('Yobe', 'Bursari', 'bursari'),
  ('Yobe', 'Damaturu', 'damaturu'),
  ('Yobe', 'Fika', 'fika'),
  ('Yobe', 'Fune', 'fune'),
  ('Yobe', 'Geidam', 'geidam'),
  ('Yobe', 'Gujba', 'gujba'),
  ('Yobe', 'Gulani', 'gulani'),
  ('Yobe', 'Jakusko', 'jakusko'),
  ('Yobe', 'Karasawa', 'karasawa'),
  ('Yobe', 'Machina', 'machina'),
  ('Yobe', 'Nangere', 'nangere'),
  ('Yobe', 'Nguru', 'nguru'),
  ('Yobe', 'Potiskum', 'potiskum'),
  ('Yobe', 'Tarmuwa', 'tarmuwa'),
  ('Yobe', 'Yunusari', 'yunusari'),
  ('Yobe', 'Yusufari', 'yusufari'),
  ('Zamfara', 'Anka', 'anka'),
  ('Zamfara', 'Bakura', 'bakura'),
  ('Zamfara', 'Birnin Magaji', 'birnin-magaji'),
  ('Zamfara', 'Bukkuyum', 'bukkuyum'),
  ('Zamfara', 'Bungudu', 'bungudu'),
  ('Zamfara', 'Gummi', 'gummi'),
  ('Zamfara', 'Gusau', 'gusau'),
  ('Zamfara', 'Kaura Namoda', 'kaura-namoda'),
  ('Zamfara', 'Maradun', 'maradun'),
  ('Zamfara', 'Maru', 'maru'),
  ('Zamfara', 'Shinkafi', 'shinkafi'),
  ('Zamfara', 'Talata Mafara', 'talata-mafara'),
  ('Zamfara', 'Tsafe', 'tsafe'),
  ('Zamfara', 'Zurmi', 'zurmi')
) as v(state, name, slug)
join public.regions r on r.country_code = 'NG' and r.name = v.state;

-- ---------------------------------------------------------------------------
-- Listings: optional second-level location (LGA). Stored as ids so search filters use indexes and a renamed LGA
-- does not orphan listings. Existing listings keep area_id = null and stay searchable by state.
-- ---------------------------------------------------------------------------
alter table public.listings add column area_id bigint references public.areas(id);
create index listings_area_idx on public.listings(area_id);
create index listings_region_status_idx on public.listings(country_code, region_id, status) where moderation_status = 'approved';

-- ---------------------------------------------------------------------------
-- Photos: up to 10 per listing (one listing, many photos: photos never count as listings). The minimum needed to publish
-- is per category, because four photos make sense for a car or a phone but not for a bag of rice or a paperback.
-- The server action enforces the minimum when a listing is published; the database enforces the maximum.
-- ---------------------------------------------------------------------------
alter table public.categories add column min_images smallint not null default 4 check (min_images between 1 and 10);
update public.categories set min_images = 2 where slug in ('food-groceries', 'books-education', 'beauty-personal-care');

create or replace function public.listing_images_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  perform 1 from public.listings where id = new.listing_id for update;  -- serialise concurrent inserts per listing
  if (select count(*) from public.listing_images where listing_id = new.listing_id) >= 10 then
    raise exception 'A listing can have at most 10 photos' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger listing_images_limit before insert on public.listing_images for each row execute function public.listing_images_limit();

-- Admin: per-category photo minimum (audited).
create or replace function public.admin_set_category_min_images(p_id bigint, p_min integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_min is null or p_min < 1 or p_min > 10 then raise exception 'Choose between 1 and 10 photos' using errcode = '22023'; end if;
  update public.categories set min_images = p_min where id = p_id;
  if not found then raise exception 'Category not found' using errcode = 'P0002'; end if;
  perform public._audit('category.min_images', 'category', p_id::text, jsonb_build_object('min_images', p_min));
end $$;
revoke execute on function public.admin_set_category_min_images(bigint, integer) from public, anon;
grant execute on function public.admin_set_category_min_images(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Free active-listing allowance: 50 -> 15. Only markets still on the old default change; a value an administrator
-- already customised is kept. Nothing is unpublished: the allowance is checked only when a listing becomes active,
-- so sellers above 15 keep every live listing and can publish again once they are below the allowance (or upgrade).
-- ---------------------------------------------------------------------------
alter table public.countries alter column free_active_listing_limit set default 15;
update public.countries set free_active_listing_limit = 15 where free_active_listing_limit = 50;

-- A plan never lowers the allowance below the free one.
create or replace function public.active_listing_limit(p_user uuid, p_country char(2))
returns integer language sql stable security definer set search_path = public as $$
  select greatest(
    coalesce((select free_active_listing_limit from public.countries where code = p_country), 0),
    coalesce((select max(p.active_listing_limit) from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
              where s.user_id = p_user and s.status = 'active' and (s.current_period_end is null or s.current_period_end > now())), 0));
$$;

-- Active listings that count towards the allowance: live and not past their expiry date (the expiry job may not have
-- run yet). Sold, archived, paused, draft and expired listings never count. Photos are rows of listing_images, not listings.
-- Callers can only count their own listings (staff and server code can count anyone's).
create or replace function public.active_listing_count(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.listings
  where seller_id = p_user and status = 'active' and (expires_at is null or expires_at > now())
    and (p_user = auth.uid() or public.is_staff() or auth.role() = 'service_role');
$$;
revoke execute on function public.active_listing_count(uuid) from public, anon;
grant execute on function public.active_listing_count(uuid) to authenticated;

-- SECURITY INVOKER so is_service()/is_staff() reflect the real caller. Same rules as 20261029000012 plus: the LGA must
-- belong to the chosen state, and the allowance check ignores listings that are already past their expiry date.
create or replace function public.listing_before_write()
returns trigger language plpgsql set search_path = public as $$
declare
  v_country public.countries%rowtype;
  v_term record;
  v_active_count integer;
  v_limit integer;
  v_trusted boolean := public.is_service() or public.is_staff();
  v_renew boolean := false;
begin
  select * into v_country from public.countries where code = new.country_code;
  if not found then
    raise exception 'Unknown country' using errcode = '23503';
  end if;

  -- Currency must match the listing's market. Prices are never silently converted.
  if new.currency is distinct from v_country.currency_code then
    raise exception 'Listing currency % does not match % market currency %', new.currency, new.country_code, v_country.currency_code
      using errcode = '23514';
  end if;

  if new.region_id is not null and not exists (select 1 from public.regions where id = new.region_id and country_code = new.country_code) then
    raise exception 'Region does not belong to the listing country' using errcode = '23514';
  end if;

  if new.area_id is not null and (new.region_id is null
      or not exists (select 1 from public.areas where id = new.area_id and region_id = new.region_id and is_active)) then
    raise exception 'The selected % is not in the selected %', coalesce(v_country.area_label, 'area'), lower(v_country.region_label)
      using errcode = '23514';
  end if;

  if new.subcategory_id is not null and not exists (select 1 from public.categories where id = new.subcategory_id and parent_id = new.category_id) then
    raise exception 'Subcategory does not belong to the selected category' using errcode = '23514';
  end if;

  if new.price_type = 'contact' then
    new.price_minor := null;
  end if;

  if not v_trusted then
    if not public.is_active_user(new.seller_id) then
      raise exception 'Account is not active' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      if not v_country.is_active then
        raise exception 'This market is not open for new listings yet' using errcode = '42501';
      end if;
      if not exists (select 1 from public.seller_profiles where user_id = new.seller_id) then
        raise exception 'Set up your seller storefront before listing' using errcode = '42501';
      end if;
      new.moderation_status := 'approved';
      new.moderation_note := null;
      new.view_count := 0; new.favourite_count := 0; new.message_count := 0;
      new.is_seed := false;
      new.sold_to := null; new.sold_at := null;
      new.published_at := null; new.expires_at := null;  -- set by the lifecycle rules below
      if new.status not in ('draft', 'active') then new.status := 'active'; end if;
    else
      -- Sellers cannot change moderation-controlled or engagement fields.
      if new.moderation_status is distinct from old.moderation_status
         or new.moderation_note is distinct from old.moderation_note
         or new.view_count is distinct from old.view_count
         or new.favourite_count is distinct from old.favourite_count
         or new.message_count is distinct from old.message_count
         or new.is_seed is distinct from old.is_seed
         or new.seller_id is distinct from old.seller_id
         or new.country_code is distinct from old.country_code then
        raise exception 'Not allowed to change protected listing fields' using errcode = '42501';
      end if;
      if old.moderation_status in ('rejected', 'removed') and new.status = 'active' then
        raise exception 'This listing was removed by moderation and cannot be reactivated' using errcode = '42501';
      end if;
      -- Lifecycle fields are server-managed (see 20261029000012).
      v_renew := new.status = 'active' and old.status = 'active' and new.expires_at is null;
      new.published_at := old.published_at;
      new.expires_at := old.expires_at;
      new.sold_to := old.sold_to;
      new.sold_at := old.sold_at;
    end if;
  end if;

  -- Prohibited-item screening (global + country-specific terms). Re-run when text changes.
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.description is distinct from old.description then
    select * into v_term from public.match_prohibited_term(new.title || ' ' || new.description, new.country_code);
    if v_term.term is not null then
      if v_term.action = 'block' and not v_trusted then
        raise exception 'This item appears to be prohibited in this market (%). See the prohibited items policy.', v_term.term using errcode = '23514';
      end if;
      if new.moderation_status = 'approved' then
        new.moderation_status := 'pending_review';
        new.moderation_note := 'Automatically held for review: matched policy term "' || v_term.term || '"';
      end if;
    end if;
  end if;

  -- Transparent active-listing allowance, checked only when a listing becomes active (never retroactively).
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') and not v_trusted then
    select count(*) into v_active_count from public.listings
      where seller_id = new.seller_id and status = 'active' and id <> new.id and (expires_at is null or expires_at > now());
    v_limit := public.active_listing_limit(new.seller_id, new.country_code);
    if v_active_count >= v_limit then
      raise exception 'You have reached your limit of % active listings. Upgrade your plan to publish more, or pause, archive or mark a listing as sold.', v_limit
        using errcode = 'P0001', hint = 'listing_limit';
    end if;
  end if;

  -- Lifecycle timestamps.
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    new.published_at := coalesce(case when tg_op = 'UPDATE' and old.status in ('active','paused','reserved') then new.published_at end, now());
    new.expires_at := now() + make_interval(days => v_country.listing_duration_days);
  elsif v_renew then
    new.expires_at := now() + make_interval(days => v_country.listing_duration_days);
  end if;
  if new.status = 'sold' and (tg_op = 'INSERT' or old.status is distinct from 'sold') then
    new.sold_at := now();
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Read model + search: LGA filter, LGA name and photo count on cards.
-- ---------------------------------------------------------------------------
create or replace view public.listing_cards with (security_invoker = true) as
  select
    l.id, l.seller_id, l.country_code, l.region_id, r.name as region_name, l.city,
    l.title, l.price_minor, l.currency, l.price_type, l.condition, l.status, l.moderation_status,
    l.quantity, l.category_id, c.slug as category_slug, l.published_at, l.created_at, l.view_count, l.favourite_count,
    l.is_seed, l.latitude, l.longitude,
    sp.shop_name, sp.slug as shop_slug, sp.verification_status as seller_verification,
    (select i.url from public.listing_images i where i.listing_id = l.id order by i.position limit 1) as image_url,
    l.area_id, a.name as area_name,
    (select count(*)::int from public.listing_images i where i.listing_id = l.id) as image_count
  from public.listings l
  join public.categories c on c.id = l.category_id
  left join public.regions r on r.id = l.region_id
  left join public.areas a on a.id = l.area_id
  left join public.seller_profiles sp on sp.user_id = l.seller_id;
grant select on public.listing_cards to anon, authenticated;

drop function public.search_listings(text, char, text, bigint, text, bigint, bigint, public.item_condition[], boolean, uuid, boolean,
  numeric, numeric, numeric, text, integer, integer);

create function public.search_listings(
  p_query text default null,
  p_country char(2) default null,
  p_category text default null,         -- category slug (parent or child)
  p_region_id bigint default null,      -- state / region
  p_city text default null,
  p_min_price bigint default null,      -- minor units, in p_country's currency
  p_max_price bigint default null,
  p_conditions public.item_condition[] default null,
  p_negotiable_only boolean default false,
  p_seller_id uuid default null,
  p_include_unavailable boolean default false,
  p_near_lat numeric default null,
  p_near_lng numeric default null,
  p_max_km numeric default null,
  p_sort text default 'relevance',      -- relevance | newest | price_asc | price_desc | nearest
  p_limit integer default 24,
  p_offset integer default 0,
  p_area_id bigint default null         -- LGA (second-level division)
)
returns setof public.listing_cards
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_tsq tsquery;
  v_q text := nullif(trim(p_query), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
  v_currency char(3);
begin
  if v_q is not null then
    v_q := left(v_q, 100);
    v_tsq := websearch_to_tsquery('simple', v_q);
  end if;
  if p_country is not null then
    select currency_code into v_currency from public.countries where code = p_country;
  end if;

  return query
  with cat as (
    select id from public.categories
    where p_category is not null and (slug = p_category or parent_id = (select id from public.categories where slug = p_category))
  ),
  base as (
    select lc.*,
      case when v_q is null then 0
           else ts_rank(l.search_vector, v_tsq) * 2 + similarity(l.title, v_q) end as text_score,
      case when p_near_lat is not null and lc.latitude is not null then
        6371 * 2 * asin(sqrt(power(sin(radians(lc.latitude - p_near_lat) / 2), 2) +
          cos(radians(p_near_lat)) * cos(radians(lc.latitude)) * power(sin(radians(lc.longitude - p_near_lng) / 2), 2)))
      end as km
    from public.listing_cards lc
    join public.listings l on l.id = lc.id
    where lc.moderation_status = 'approved'
      and (case when p_include_unavailable then lc.status in ('active','reserved','sold') else lc.status = 'active' end)
      and (p_country is null or lc.country_code = p_country)
      and (v_q is null or l.search_vector @@ v_tsq or l.title % v_q or l.title ilike '%' || v_q || '%')
      and (p_category is null or lc.category_id in (select id from cat) or l.subcategory_id in (select id from cat))
      and (p_region_id is null or lc.region_id = p_region_id)
      and (p_area_id is null or lc.area_id = p_area_id)
      and (p_city is null or lc.city ilike p_city)
      -- Price filters only apply in the market's own currency (no conversion).
      and (p_min_price is null or (lc.currency = v_currency and lc.price_minor >= p_min_price))
      and (p_max_price is null or (lc.currency = v_currency and lc.price_minor <= p_max_price))
      and (p_conditions is null or lc.condition = any(p_conditions))
      and (not p_negotiable_only or lc.price_type = 'negotiable')
      and (p_seller_id is null or lc.seller_id = p_seller_id)
  )
  select b.id, b.seller_id, b.country_code, b.region_id, b.region_name, b.city, b.title, b.price_minor, b.currency,
         b.price_type, b.condition, b.status, b.moderation_status, b.quantity, b.category_id, b.category_slug,
         b.published_at, b.created_at, b.view_count, b.favourite_count, b.is_seed, b.latitude, b.longitude,
         b.shop_name, b.shop_slug, b.seller_verification, b.image_url, b.area_id, b.area_name, b.image_count
  from base b
  where (p_max_km is null or p_near_lat is null or (b.km is not null and b.km <= p_max_km))
  order by
    case when p_sort = 'price_asc' then b.price_minor end asc nulls last,
    case when p_sort = 'price_desc' then b.price_minor end desc nulls last,
    case when p_sort = 'nearest' then b.km end asc nulls last,
    case when p_sort = 'relevance' then
      -- organic score: text relevance + freshness decay + light engagement signal + image presence
      b.text_score
      + 1.0 / (1 + extract(epoch from (now() - coalesce(b.published_at, b.created_at))) / 86400 / 7)
      + ln(1 + b.favourite_count) * 0.15 + ln(1 + b.view_count) * 0.05
      + case when b.image_url is not null then 0.2 else 0 end
    end desc nulls last,
    b.published_at desc nulls last, b.id
  limit v_limit offset v_offset;
end $$;

grant execute on function public.search_listings to anon, authenticated;
