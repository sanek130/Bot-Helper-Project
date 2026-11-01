import { Router } from 'express';
import { getCities, getCityById, getSchoolOptions } from '../../utils/searchService.js';
import { getRegisteredSchoolsInCity } from '../../services/userService.js';
import { asyncRoute } from '../helpers.js';

export const dataRouter = Router();

dataRouter.get('/cities', (req, res) => {
  res.json({ cities: getCities().map((city) => ({ id: city.id, name: city.name })) });
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
