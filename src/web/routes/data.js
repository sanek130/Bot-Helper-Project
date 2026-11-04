import { Router } from 'express';
import { getCities, getCityById, getSchoolOptions, findSchoolInCity, createSchool, SCHOOL_TYPES } from '../../utils/searchService.js';
import { getRegisteredSchoolsInCity } from '../../services/userService.js';
import { asyncRoute } from '../helpers.js';

export const dataRouter = Router();

dataRouter.get('/cities', (req, res) => {
  res.json({ cities: getCities().map((city) => ({ id: city.id, name: city.name })) });
});

dataRouter.get('/school-types', (req, res) => {
  res.json({ types: SCHOOL_TYPES });
});

dataRouter.get(
  '/schools',
  asyncRoute(async (req, res) => {
    const city = getCityById(String(req.query.cityId ?? ''));
    if (!city) return res.status(400).json({ error: 'invalid_city' });
    const registered = await getRegisteredSchoolsInCity(city.name);
    return res.json({ schools: getSchoolOptions(city.id, registered) });
  }),
);

// Проверка школы перед созданием: есть ли уже такая в справочнике города.
dataRouter.post(
  '/school/check',
  asyncRoute(async (req, res) => {
    const city = getCityById(String(req.body?.cityId ?? ''));
    if (!city) return res.status(400).json({ error: 'invalid_city' });
    const type = String(req.body?.type ?? '').trim().toLowerCase();
    const number = String(req.body?.number ?? '').trim();
    if (!SCHOOL_TYPES.includes(type) || !/^\d{1,4}$/.test(number)) return res.status(400).json({ error: 'invalid_school' });
    const found = findSchoolInCity(city.id, `${type} ${number}`);
    return res.json({ exists: Boolean(found), name: found ? found.name : `${type} ${number}` });
  }),
);

// Создание школы из регистрации («нет моей школы»): если есть — возвращаем существующую.
dataRouter.post(
  '/school/create',
  asyncRoute(async (req, res) => {
    const city = getCityById(String(req.body?.cityId ?? ''));
    if (!city) return res.status(400).json({ error: 'invalid_city' });
    const type = String(req.body?.type ?? '').trim().toLowerCase();
    const number = String(req.body?.number ?? '').trim();
    const school = createSchool({ cityId: city.id, type, number });
    if (!school) return res.status(400).json({ error: 'invalid_school' });
    return res.status(201).json({ school: { id: school.id, name: school.name } });
  }),
);
